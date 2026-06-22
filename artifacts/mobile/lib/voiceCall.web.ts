import {
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type RemoteTrack,
} from "livekit-client";

export const voiceCallSupported = true;

let room: Room | null = null;
let unlockHandler: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;
let micTrack: MediaStreamTrack | null = null;
let micRestarting = false;
let micLost = false;

// Mobile browsers route WebRTC remote audio through the quiet earpiece/call
// channel and an <audio> element's `volume` is hard-capped at 1.0, so on a phone
// the call sounds far too quiet. To make it audible we route the remote stream
// through the Web Audio graph and amplify it past 1.0 with a GainNode. Keeping
// the (now-muted) <audio> element attached is still required: some browsers only
// let a MediaStreamAudioSourceNode pull audio from a remote track while that
// track is also attached to a playing media element, and the element remains the
// surface our iOS interruption-recovery logic watches.
let audioCtx: AudioContext | null = null;
// Per-track Web Audio nodes so we can disconnect exactly the right ones on
// unsubscribe without tearing down the whole graph. A compressor sits before the
// gain so we can push perceived loudness up hard without the makeup gain clipping
// into distortion on louder speech.
const gainNodes = new Map<
  string,
  {
    src: MediaStreamAudioSourceNode;
    compressor: DynamicsCompressorNode;
    gain: GainNode;
  }
>();
// Elements whose audio is being played through the gain graph. They are muted
// ONLY while the context is actually running (so the boosted graph is the single
// sound source); whenever the context is suspended they are un-muted so the call
// is never fully silent — the #1 cause of "한쪽은 안 들림".
const boostedEls = new Set<HTMLAudioElement>();
// Makeup gain applied AFTER compression. With the compressor taming peaks this
// can be pushed past the old 1.0 element cap for a genuinely louder phone call
// without the distortion a raw 2x+ gain would cause.
const REMOTE_GAIN = 3.0;

// The (un-)muted state of every boosted element tracks the context's run state:
// muted while running (graph is the sound source), audible while suspended (graph
// is silent, so fall back to the raw element). Re-run on every statechange.
function syncBoostedMute(): void {
  const running = audioCtx?.state === "running";
  boostedEls.forEach((el) => {
    if (el.isConnected) el.muted = running;
  });
}

function getAudioCtx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
      // Keep every boosted element's mute state in lockstep with the run state,
      // so a resume (loud graph → mute element) or a suspend (silent graph →
      // un-mute element) never leaves the call silent.
      audioCtx.addEventListener("statechange", syncBoostedMute);
    }
    // iOS suspends the context on any interruption; nudge it back awake. Safe to
    // call repeatedly.
    if (audioCtx.state === "suspended") void audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch {
    return null;
  }
}

// A stable per-track key for the gain map. `sid` is the natural choice but is
// typed optional, so fall back to the underlying MediaStreamTrack id.
function trackKey(track: RemoteTrack): string {
  return track.sid ?? track.mediaStreamTrack?.id ?? "";
}

// Build src -> gain -> destination for a remote audio track. Returns true only
// if the graph was wired up, so the caller knows it's safe to mute the element
// (muting it when this returns false would leave the call silent).
function attachGain(track: RemoteTrack): boolean {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return false;
    const mst = track.mediaStreamTrack;
    if (!mst) return false;
    const key = trackKey(track);
    if (!key) return false;
    // A network reconnect can re-fire TrackSubscribed for a track we already
    // wired up. Tear the old nodes down first so we never stack two src->gain
    // chains on the destination (which would double the audio, drift the volume,
    // and leak the orphaned nodes).
    detachGain(key);
    const src = ctx.createMediaStreamSource(new MediaStream([mst]));
    // Compress first so loud speech is reined in, then apply makeup gain — this
    // raises perceived loudness far more than a bare gain could before the
    // destination starts hard-clipping.
    const compressor = ctx.createDynamicsCompressor();
    const gain = ctx.createGain();
    gain.gain.value = REMOTE_GAIN;
    src.connect(compressor);
    compressor.connect(gain);
    gain.connect(ctx.destination);
    gainNodes.set(key, { src, compressor, gain });
    return true;
  } catch {
    return false;
  }
}

function detachGain(sid: string): void {
  const node = gainNodes.get(sid);
  if (!node) return;
  try {
    node.src.disconnect();
    node.compressor.disconnect();
    node.gain.disconnect();
  } catch {
    // already torn down
  }
  gainNodes.delete(sid);
}

function teardownAudioGraph(): void {
  // Disconnect the per-track nodes and forget the boosted elements, but DO NOT
  // close the shared AudioContext.
  //
  // joinCall() calls leaveCall() (→ here) at its very start, milliseconds after
  // primeAudioPlayback() created + resumed audioCtx on the genuine call-button
  // gesture. Closing it would throw that gesture-unlocked "running" state away.
  // The remote track then arrives seconds later — after the callee accepts,
  // outside any gesture — so getAudioCtx() would have to build a FRESH context,
  // which iOS leaves SUSPENDED and refuses to resume() without a gesture. A
  // suspended context = silent gain graph, so that side drops to no / very faint
  // audio. This is a prime cause of the intermittent "한쪽만 안 들림".
  //
  // Keeping one persistent, gesture-primed context means the gain graph is live
  // the instant the remote track subscribes — no extra tap required. Between
  // calls it is harmless: no nodes are connected, so it produces no sound, and
  // its statechange listener is a no-op while boostedEls is empty.
  gainNodes.forEach((_node, sid) => detachGain(sid));
  gainNodes.clear();
  boostedEls.clear();
}

// Screen Wake Lock keeps the display from auto-dimming/locking during a call.
// iOS Safari (16.4+) freezes the page's JS and WebRTC audio the moment the
// screen locks, which silences the call — the single most common cause being
// the screen simply timing out while the user is talking. Holding a wake lock
// prevents that auto-lock. (It cannot stop a manual power-button lock; recovery
// for that path happens on unlock via the visibility handler.)
type WakeLockLike = {
  release: () => Promise<void>;
  addEventListener?: (type: "release", cb: () => void) => void;
};
let wakeLock: WakeLockLike | null = null;
// Bumped on every release/invalidate so an in-flight request() that resolves
// after teardown (or is superseded by a newer request) drops its sentinel
// instead of leaking it.
let wakeLockGen = 0;

async function requestWakeLock(): Promise<void> {
  const wl = (
    navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> };
    }
  ).wakeLock;
  if (!wl || wakeLock) return;
  const gen = ++wakeLockGen;
  try {
    const sentinel = await wl.request("screen");
    // The call may have ended (or a newer request started) while we awaited —
    // if so this sentinel is stale, so release it immediately rather than keep
    // it around.
    if (gen !== wakeLockGen || !room) {
      void sentinel.release().catch(() => {});
      return;
    }
    wakeLock = sentinel;
    // The OS auto-releases the lock whenever the page is hidden; clear our
    // reference so the visibility handler re-acquires a fresh one on return.
    sentinel.addEventListener?.("release", () => {
      if (wakeLock === sentinel) wakeLock = null;
    });
  } catch {
    // Denied or unsupported — best effort only.
  }
}

function releaseWakeLock(): void {
  // Invalidate any in-flight request so its sentinel is dropped on resolve.
  wakeLockGen++;
  if (wakeLock) {
    void wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// A ~50ms silent WAV. Playing this from a real button gesture (BEFORE any
// network await) grants the document media-playback engagement, so the remote
// track's <audio> element — which only arrives seconds later, after the callee
// accepts, when the original gesture's transient activation is long gone — can
// autoplay without an extra tap. This is the structural fix for the "한쪽만
// 들리거나 둘 다 안 들림" autoplay block: the in-call startAudio() pre-auth runs
// after createCall/acceptCall awaits, by which point the activation is already
// spent, so priming must happen on the genuine gesture instead.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

let primeEl: HTMLAudioElement | null = null;

// Must be called SYNCHRONOUSLY at the top of a user-gesture handler (call/accept
// button press) before any await. Best-effort; silently no-ops if blocked.
export function primeAudioPlayback(): void {
  try {
    if (!primeEl) {
      primeEl = document.createElement("audio");
      primeEl.setAttribute("playsinline", "true");
      (primeEl as unknown as { playsInline: boolean }).playsInline = true;
      primeEl.src = SILENT_WAV;
      primeEl.load();
    }
    primeEl.currentTime = 0;
    void primeEl.play().catch(() => {});
    // Create + resume the Web Audio context HERE, on the genuine gesture, so it's
    // already "running" by the time the remote track arrives (after the accept
    // await). Otherwise iOS leaves it suspended → the gain graph is silent and we
    // fall back to the quiet raw element ("아직도 작게 들림").
    getAudioCtx();
  } catch {
    // best effort
  }
}

// Ringback tone (통화 연결음). Generated with Web Audio oscillators so no audio
// asset file is needed. Plays the standard 440+480 Hz dual tone in a 1s-on /
// 2s-off cadence while the caller waits for the callee to answer.
//
// It runs on its OWN dedicated AudioContext, deliberately separate from the
// shared call `audioCtx`. joinCall() begins with leaveCall() →
// teardownAudioGraph(), which closes the shared context; if the ringback shared
// it, the tone would die the instant we join the LiveKit room — i.e. right at
// the start of the waiting period when it most needs to play. A private context
// is unaffected by that teardown and is fully owned by stop/startRingback.
let ringbackCtx: AudioContext | null = null;
let ringbackOscillators: OscillatorNode[] = [];
let ringbackGain: GainNode | null = null;
let ringbackTimer: ReturnType<typeof setInterval> | null = null;
let ringbackActive = false;

function ringbackBurst(): void {
  if (!ringbackGain || !ringbackCtx) return;
  const now = ringbackCtx.currentTime;
  const g = ringbackGain.gain;
  // ~1s audible burst, ramped at both ends so it doesn't click on/off.
  // exponentialRampToValueAtTime can't target exactly 0, so use a tiny floor.
  g.cancelScheduledValues(now);
  g.setValueAtTime(0.0001, now);
  g.exponentialRampToValueAtTime(0.16, now + 0.05);
  g.setValueAtTime(0.16, now + 0.95);
  g.exponentialRampToValueAtTime(0.0001, now + 1.0);
}

// Must be called SYNCHRONOUSLY within the call-button gesture (before any await)
// so the freshly created context is allowed to start running.
export function startRingback(): void {
  if (ringbackActive) return;
  let ctx: AudioContext | null = null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    void ctx.resume().catch(() => {});
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(ctx.destination);
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.frequency.value = 440;
    o2.frequency.value = 480;
    o1.connect(gain);
    o2.connect(gain);
    o1.start();
    o2.start();
    ringbackCtx = ctx;
    ringbackOscillators = [o1, o2];
    ringbackGain = gain;
    ringbackActive = true;
    ringbackBurst();
    // 1s on + 2s off = 3s cadence.
    ringbackTimer = setInterval(ringbackBurst, 3000);
  } catch {
    // best effort — a silent ringback never blocks the call itself. Close any
    // partially-created context so it doesn't leak when setup throws midway.
    ringbackActive = false;
    if (ctx) {
      void ctx.close().catch(() => {});
    }
  }
}

export function stopRingback(): void {
  ringbackActive = false;
  if (ringbackTimer) {
    clearInterval(ringbackTimer);
    ringbackTimer = null;
  }
  ringbackOscillators.forEach((o) => {
    try {
      o.stop();
    } catch {
      // already stopped
    }
    try {
      o.disconnect();
    } catch {
      // already disconnected
    }
  });
  ringbackOscillators = [];
  if (ringbackGain) {
    try {
      ringbackGain.disconnect();
    } catch {
      // already disconnected
    }
    ringbackGain = null;
  }
  if (ringbackCtx) {
    void ringbackCtx.close().catch(() => {});
    ringbackCtx = null;
  }
}

// Incoming-call ringtone (벨소리) for the CALLEE — deliberately distinct from
// the caller's ringback tone above so the two ends sound different. A brisk
// "double-ring" cadence (two short bursts, then a gap) on a higher pair of
// tones. Like the ringback it runs on its OWN dedicated AudioContext so it is
// never torn down by the call audio graph, and is fully owned by
// start/stopRingtone.
//
// NOTE: browsers may block this from starting without a prior user gesture
// (autoplay policy). It is best-effort: a silent ringtone never blocks the
// incoming UI, and the visible incoming modal is always shown regardless.
let ringtoneCtx: AudioContext | null = null;
let ringtoneOscillators: OscillatorNode[] = [];
let ringtoneGain: GainNode | null = null;
let ringtoneTimer: ReturnType<typeof setInterval> | null = null;
let ringtoneActive = false;

function ringtoneBurst(): void {
  if (!ringtoneGain || !ringtoneCtx) return;
  const now = ringtoneCtx.currentTime;
  const g = ringtoneGain.gain;
  g.cancelScheduledValues(now);
  // Two short "rings" (0.35s on / 0.18s gap) then the interval's longer silence.
  const ring = (start: number) => {
    g.setValueAtTime(0.0001, start);
    g.exponentialRampToValueAtTime(0.2, start + 0.04);
    g.setValueAtTime(0.2, start + 0.3);
    g.exponentialRampToValueAtTime(0.0001, start + 0.35);
  };
  ring(now);
  ring(now + 0.53);
}

export function startRingtone(): void {
  if (ringtoneActive) return;
  let ctx: AudioContext | null = null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    void ctx.resume().catch(() => {});
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(ctx.destination);
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    // Higher, brighter pair than the 440/480 ringback so the callee's ringtone
    // is clearly a different sound.
    o1.frequency.value = 660;
    o2.frequency.value = 550;
    o1.connect(gain);
    o2.connect(gain);
    o1.start();
    o2.start();
    ringtoneCtx = ctx;
    ringtoneOscillators = [o1, o2];
    ringtoneGain = gain;
    ringtoneActive = true;
    ringtoneBurst();
    // double-ring (~0.9s) + ~1.1s silence = 2s cadence.
    ringtoneTimer = setInterval(ringtoneBurst, 2000);
  } catch {
    ringtoneActive = false;
    if (ctx) void ctx.close().catch(() => {});
  }
}

export function stopRingtone(): void {
  ringtoneActive = false;
  if (ringtoneTimer) {
    clearInterval(ringtoneTimer);
    ringtoneTimer = null;
  }
  ringtoneOscillators.forEach((o) => {
    try {
      o.stop();
    } catch {
      // already stopped
    }
    try {
      o.disconnect();
    } catch {
      // already disconnected
    }
  });
  ringtoneOscillators = [];
  if (ringtoneGain) {
    try {
      ringtoneGain.disconnect();
    } catch {
      // already disconnected
    }
    ringtoneGain = null;
  }
  if (ringtoneCtx) {
    void ringtoneCtx.close().catch(() => {});
    ringtoneCtx = null;
  }
}

const AUDIO_ATTR = "data-livekit-audio";

function getAudioElements(): HTMLAudioElement[] {
  return Array.from(
    document.querySelectorAll<HTMLAudioElement>(`[${AUDIO_ATTR}="true"]`),
  );
}

function clearAudioElements() {
  getAudioElements().forEach((el) => {
    boostedEls.delete(el);
    el.pause();
    el.srcObject = null;
    el.remove();
  });
}

// When the browser blocks audio playback, it can only be resumed from a real
// user gesture. Listen once for the next tap/click and resume via startAudio().
function installUnlockHandler(r: Room) {
  if (unlockHandler) return;
  unlockHandler = () => {
    // A real gesture is also the moment iOS lets us resume a suspended Web Audio
    // context, so unlock both the LiveKit playback and the gain graph at once.
    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => {});
    }
    void r.startAudio().then(removeUnlockHandler).catch(() => {});
  };
  document.addEventListener("click", unlockHandler, true);
  document.addEventListener("touchend", unlockHandler, true);
}

function removeUnlockHandler() {
  if (!unlockHandler) return;
  document.removeEventListener("click", unlockHandler, true);
  document.removeEventListener("touchend", unlockHandler, true);
  unlockHandler = null;
}

// iOS Safari pauses WebRTC <audio> elements mid-call on any interruption —
// screen lock, an incoming system sound, or briefly switching apps — and often
// does NOT fire AudioPlaybackStatusChanged, so the element silently stays paused
// for the rest of the call (the user thinks the call "went mute"). Fight back:
// whenever something pauses the element while the call is still live, replay it.
function keepPlaying(el: HTMLAudioElement) {
  el.addEventListener("pause", () => {
    // Only resume while the call is active and the element is still attached;
    // during teardown `room` is nulled first so we don't resurrect dead audio.
    if (room && el.isConnected) {
      void el.play().catch(() => {});
    }
  });
}

// Re-arm playback for every attached track. Used when the page returns to the
// foreground (iOS suspends the audio while backgrounded) or playback is allowed
// again.
function resumeAllAudio() {
  if (!room) return;
  if (!room.canPlaybackAudio) {
    void room.startAudio().catch(() => {});
  }
  // iOS suspends the Web Audio context whenever the call is interrupted; without
  // resuming it the amplified remote audio (which now flows through the gain
  // graph, not the element) would stay silent after a screen-lock/app-switch.
  if (audioCtx && audioCtx.state === "suspended") {
    void audioCtx.resume().catch(() => {});
  }
  getAudioElements().forEach((el) => {
    if (el.paused) void el.play().catch(() => {});
  });
}

// The OTHER half of the iOS problem: when iOS interrupts the audio session it
// also kills the LOCAL microphone MediaStreamTrack (it goes "muted" or "ended")
// and never revives it, so the remote side keeps receiving the published track
// but it carries silence — the peer stops hearing this device mid-call. Watch
// the live mic track for those events and re-acquire it via restartTrack().
function armMicRecovery() {
  if (!room) return;
  const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
  const mst = pub?.track?.mediaStreamTrack ?? null;
  if (mst === micTrack) return;
  micTrack = mst;
  if (!mst) return;
  const onLost = () => {
    micLost = true;
    // Only recover if the user still intends the mic to be on (don't override a
    // deliberate mute).
    if (room && room.localParticipant.isMicrophoneEnabled) {
      void restartMic();
    }
  };
  mst.addEventListener("mute", onLost);
  mst.addEventListener("ended", onLost);
}

// True only when the mic actually looks dead — so a plain app-switch return that
// left the mic healthy doesn't trigger a needless re-acquire (which would cause
// a brief audible gap).
function micNeedsRecovery(): boolean {
  if (micLost) return true;
  if (!micTrack) return false;
  return micTrack.readyState === "ended" || micTrack.muted;
}

async function restartMic() {
  if (!room || micRestarting) return;
  if (!room.localParticipant.isMicrophoneEnabled) return;
  micRestarting = true;
  try {
    const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const track = pub?.track as LocalAudioTrack | undefined;
    if (track && typeof track.restartTrack === "function") {
      // Re-runs getUserMedia with the same constraints and swaps in a fresh
      // MediaStreamTrack on the existing publication — the LiveKit-recommended
      // way to recover from an OS audio-session interruption.
      await track.restartTrack();
    } else {
      // Fallback: unpublish + republish forces a new getUserMedia.
      await room.localParticipant.setMicrophoneEnabled(false);
      await room.localParticipant.setMicrophoneEnabled(true);
    }
  } catch {
    // best effort
  } finally {
    micRestarting = false;
    micLost = false;
    // The underlying track changed; re-arm listeners on the fresh one.
    micTrack = null;
    armMicRecovery();
  }
}

function installVisibilityHandler() {
  if (visibilityHandler) return;
  visibilityHandler = () => {
    if (document.visibilityState === "visible") {
      resumeAllAudio();
      // The OS releases the wake lock whenever the page is hidden, so re-acquire
      // it every time we return to the foreground while a call is live.
      if (room) void requestWakeLock();
      // Coming back to the foreground is the most reliable moment to rescue a
      // mic the OS suspended while we were away — but only if it actually looks
      // dead, so a healthy app-switch return doesn't cause a needless gap.
      if (room && room.localParticipant.isMicrophoneEnabled && micNeedsRecovery()) {
        void restartMic();
      }
    }
  };
  document.addEventListener("visibilitychange", visibilityHandler);
  window.addEventListener("focus", visibilityHandler);
}

function removeVisibilityHandler() {
  if (!visibilityHandler) return;
  document.removeEventListener("visibilitychange", visibilityHandler);
  window.removeEventListener("focus", visibilityHandler);
  visibilityHandler = null;
}

export async function joinCall(url: string, token: string): Promise<void> {
  await leaveCall();

  // Explicit voice-call audio processing. Without echo cancellation the remote
  // side hears their own voice bounced back off this device's loudspeaker —
  // which sounds like "스피커폰이 켜진 것처럼" echoey/distant audio. Auto gain
  // keeps the captured mic level steady so the peer doesn't hear you too quiet.
  // Setting them on the Room defaults guarantees they're re-applied on EVERY mic
  // (re)acquisition — initial publish, restartTrack(), and the republish
  // fallback — not just the first one.
  const r = new Room({
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
    if (track.kind === Track.Kind.Audio) {
      // On a network reconnect LiveKit can fire TrackSubscribed again for a
      // track that still has a live <audio> element attached. Detach any prior
      // elements for THIS track first so we never stack two players for the same
      // remote stream — duplicated playback sounds louder and phase-combs into a
      // speakerphone-like echo.
      track.detach().forEach((old) => {
        boostedEls.delete(old as HTMLAudioElement);
        old.remove();
      });
      const el = track.attach() as HTMLAudioElement;
      el.setAttribute(AUDIO_ATTR, "true");
      el.autoplay = true;
      // playsInline keeps iOS from hijacking playback into a fullscreen player.
      el.setAttribute("playsinline", "true");
      (el as unknown as { playsInline: boolean }).playsInline = true;
      el.volume = 1;
      document.body.appendChild(el);
      // Amplify the remote audio past the element's 1.0 cap so it's loud enough
      // on a phone. Mute the element only while the gain graph is actually running
      // (single sound source); if the graph never wired up OR the context is
      // suspended, the un-boosted element stays audible so the call is never fully
      // silent. syncBoostedMute() keeps this in lockstep as the context resumes.
      if (attachGain(track)) {
        boostedEls.add(el);
        el.muted = audioCtx?.state === "running";
      } else {
        el.muted = false;
      }
      keepPlaying(el);
      // The caller only subscribes to the remote track AFTER the callee accepts,
      // which is long after the click that started the call — so the browser's
      // autoplay activation has lapsed and play() is blocked, leaving the caller
      // in silence. Try to play; if blocked, the AudioPlaybackStatusChanged
      // handler below arms a one-shot gesture unlock.
      void el.play().catch(() => {});
    }
  });

  r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    detachGain(trackKey(track));
    track.detach().forEach((el) => {
      boostedEls.delete(el as HTMLAudioElement);
      el.remove();
    });
  });

  // Fires when the browser blocks (or later allows) audio playback. When
  // blocked, audio must be resumed from a user gesture; when allowed again,
  // drop the pending unlock listener and replay any paused elements.
  r.on(RoomEvent.AudioPlaybackStatusChanged, () => {
    if (!r.canPlaybackAudio) {
      installUnlockHandler(r);
    } else {
      removeUnlockHandler();
      resumeAllAudio();
    }
  });

  // Whenever the local mic (re)publishes, attach interruption listeners to the
  // new underlying track.
  r.on(RoomEvent.LocalTrackPublished, () => armMicRecovery());

  await r.connect(url, token);
  await r.localParticipant.setMicrophoneEnabled(true);
  // Secondary pre-authorization. The button-gesture activation is already spent
  // by the createCall/acceptCall await that precedes this — primeAudioPlayback()
  // (called on that gesture in CallProvider) is what actually unlocks playback;
  // this startAudio() is a best-effort backup for when the context is suspended.
  if (!r.canPlaybackAudio) {
    await r.startAudio().catch(() => {});
  }
  room = r;
  armMicRecovery();
  // Recover audio after iOS interruptions / app-switch once the call is live.
  installVisibilityHandler();
  // Keep the screen awake so an auto-lock doesn't silence the call.
  void requestWakeLock();
}

export async function setMuted(muted: boolean): Promise<void> {
  if (room) {
    await room.localParticipant.setMicrophoneEnabled(!muted);
    // The publication's track changes when re-enabled; keep recovery armed.
    micTrack = null;
    armMicRecovery();
  }
}

export async function leaveCall(): Promise<void> {
  removeUnlockHandler();
  removeVisibilityHandler();
  releaseWakeLock();
  // Null `room` before disconnecting so keepPlaying()'s pause handler and the
  // mic-recovery listeners don't try to resurrect tracks as they're torn down.
  const r = room;
  room = null;
  micTrack = null;
  micRestarting = false;
  micLost = false;
  if (r) {
    await r.disconnect();
  }
  clearAudioElements();
  teardownAudioGraph();
}
