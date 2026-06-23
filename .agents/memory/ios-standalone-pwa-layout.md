---
name: iOS standalone PWA whole-app right-shift
description: Home-screen-installed (standalone) PWA looks "spread out / shifted right" on EVERY screen while a normal browser tab renders fine — cause and fix.
---

# iOS standalone PWA — whole-app shifted right

Symptom: user installs the web build to the iOS home screen ("Add to Home Screen" → standalone) and the WHOLE app looks spread out / pushed to the right on every screen, but loading the same URL in a Safari TAB (or our 390px preview) renders perfectly.

**Cause:** in standalone mode there is no browser chrome, so once the document gets horizontally scrolled (by any element even a few px wider than the viewport — e.g. a wrapped flex grid on the home screen), iOS keeps it stuck scrolled to the right and the offset persists across navigations, so it looks like the *entire* app is shifted. A single overflowing screen makes all screens look shifted because the horizontal scroll position is document-level.

**Fix:** clamp the root elements so the document can never scroll horizontally:
`html, body, #root { width:100%; max-width:100%; overflow-x:hidden; }` plus `viewport-fit=cover`.

**Why injected in `scripts/build.js`, not `app/+html.tsx`:** `app/+html.tsx` is only consumed by Expo's STATIC web render (`web.output:"static"`). This app uses the default single-page (`single`) web output, where `+html.tsx` is silently ignored — verified: dev/export served HTML stays the built-in template. Switching to `static` pre-renders every route (risky for auth-gated routes), so instead `build.js` post-processes the exported `web-build/index.html` (idempotent, best-effort so a patch failure never blocks the deploy).

**How to apply / verify:**
- Web-only — does NOT touch native (APK/iOS) builds.
- Takes effect only after a **production redeploy** (build.js runs at deploy, not in dev).
- iOS caches the standalone shell aggressively: after redeploy the user must **delete the home-screen icon and re-add it**, or the old broken layout persists.
- Can't run `expo export -p web` on Replit to verify (OOMs in dev container); validate the patch by running the transform against the dev-served HTML instead.
