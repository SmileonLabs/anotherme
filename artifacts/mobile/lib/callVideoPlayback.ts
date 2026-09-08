/** Own the DOM playback lifecycle independently from room/track subscription. */
export function attachCallVideoPlayback(
  track: {
    attach(element: HTMLMediaElement): unknown;
    detach(element: HTMLMediaElement): unknown;
    mediaStreamTrack?: MediaStreamTrack;
  },
  element: HTMLVideoElement,
  options: {
    muted: boolean;
    onBlocked: (blocked: boolean) => void;
  },
): { play: () => void; dispose: () => void } {
  const document = element.ownerDocument;
  const window = document.defaultView;
  let disposed = false;
  let playAttempt = 0;

  // Let LiveKit choose autoplay per browser. Its Safari implementation omits
  // the autoplay attribute to avoid WebKit's low-power-mode playback overlay.
  element.removeAttribute("autoplay");
  element.autoplay = false;
  element.playsInline = true;
  element.setAttribute("playsinline", "true");
  element.muted = options.muted;
  element.defaultMuted = options.muted;

  const play = () => {
    if (disposed || document.visibilityState === "hidden") return;
    const attempt = ++playAttempt;
    try {
      void element.play().catch((error: unknown) => {
        if (disposed || attempt !== playAttempt) return;
        // Loading/replacing a stream interrupts a previous play request. It is
        // not a permissions failure and must not override a newer playing event.
        if ((error as { name?: string } | null)?.name === "AbortError") return;
        options.onBlocked(true);
      });
    } catch {
      if (!disposed && attempt === playAttempt) options.onBlocked(true);
    }
  };
  const playing = () => {
    if (disposed) return;
    playAttempt += 1;
    options.onBlocked(false);
  };
  const mediaTrack = track.mediaStreamTrack;
  element.addEventListener("playing", playing);
  element.addEventListener("loadedmetadata", play);
  element.addEventListener("canplay", play);
  mediaTrack?.addEventListener("unmute", play);
  window?.addEventListener("focus", play);
  document.addEventListener("visibilitychange", play);
  track.attach(element);
  play();

  return {
    play,
    dispose() {
      if (disposed) return;
      disposed = true;
      playAttempt += 1;
      element.removeEventListener("playing", playing);
      element.removeEventListener("loadedmetadata", play);
      element.removeEventListener("canplay", play);
      mediaTrack?.removeEventListener("unmute", play);
      window?.removeEventListener("focus", play);
      document.removeEventListener("visibilitychange", play);
      track.detach(element);
    },
  };
}
