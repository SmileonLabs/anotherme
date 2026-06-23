---
name: Friend-add screen native crash (APK)
description: The friends/add crash is a native fatal crash, not a catchable JS error — how to actually diagnose it.
---

# friends/add crash is NATIVE, not JS

Symptom: tapping 친구추가 in the **release/preview APK** fully closes the app (back to
home launcher), with NO in-app error screen.

**Proven native, not JS:** `app/_layout.tsx` wraps the ENTIRE app in `<ErrorBoundary>`
at the root. A JS render error would be caught and render `ErrorFallback` (we removed the
`__DEV__` gates so details show in prod) — the app would NOT close. Since it closes
anyway, the fatal error is below the JS layer (native module / Java/JNI / native UI
commit). React error boundaries cannot catch that, and neither can a JS global handler.

Also NOT data-volume related: prod DB has ~1 user, so the friend list renders 0–1 rows —
not an image/OOM flood. The screen's own code (Avatar assets exist, CustomScroll is pure
JS, mediaUri yields absolute https URLs) has no obvious native crasher.

**The only way forward is the real native error:**
1. `adb logcat` from a PC while reproducing on the already-installed APK (no rebuild). Best
   because it captures native fatals too.
2. OR an EAS `development`-profile build + `expo start --dev-client` → redbox shows the JS
   stack IF (and only if) it's actually JS.

**Do not** keep patching suspected causes blindly or re-running the web test skill — web
never reproduces this (different platform). Get the logcat first.
