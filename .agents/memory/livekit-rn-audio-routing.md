---
name: LiveKit RN native call audio routing
description: @livekit/react-native defaults a call to the LOUDSPEAKER, not the earpiece — must configureAudio() for a phone-style 1:1 call.
---

# Native voice-call audio routing (수신부/earpiece)

`@livekit/react-native`'s `AudioSession` defaults route a call to the **loudspeaker (스피커폰)**, NOT the earpiece you hold to your ear:

- Android default `preferredOutputList` order is `bluetooth, headset, **speaker**, earpiece` — speaker wins before earpiece.
- iOS `defaultOutput` defaults to `'speaker'`.

So a bare `AudioSession.startAudioSession()` makes a 1:1 voice call blast out the loudspeaker, which surprises users expecting normal phone behavior.

**Fix (in `joinCall`, native `voiceCall.ts`):** call `AudioSession.configureAudio({ android: { preferredOutputList: ['bluetooth','headset','earpiece'], audioTypeOptions: AndroidAudioTypePresets.communication }, ios: { defaultOutput: 'earpiece' } })` BEFORE `startAudioSession()` (and before `Room.connect`).

**Why:** earpiece-default = expected phone-call UX; bluetooth/headset still take priority when connected.

**How to apply:**
- `configureAudio()` must run before `startAudioSession()`, which must run before room connect.
- Keep `configureAudio()` in its OWN best-effort try/catch and ALWAYS still attempt `startAudioSession()` — if config throws on some device, skipping session start would leave the call with NO audio. Default routing is an acceptable fallback; no audio is not.
- Mic publish (`setMicrophoneEnabled(true)`) and remote-track auto-playback are unaffected by routing config.
- Cannot be verified on Replit (needs an EAS build on 2 real devices). Web/PWA can't choose earpiece vs speaker — browser/OS decides — so this is native-only.
- A future speaker/earpiece in-call toggle would use `AudioSession.selectAudioOutput(deviceId)` + `getAudioOutputs()`.
