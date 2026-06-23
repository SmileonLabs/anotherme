---
name: iOS standalone PWA whole-app right-shift
description: Home-screen-installed (standalone) PWA looks "spread out / shifted right" on EVERY screen while a normal browser tab renders fine — cause and fix.
---

# iOS standalone PWA — whole-app shifted right

Symptom: user installs the web build to the iOS home screen ("Add to Home Screen" → standalone) and the WHOLE app looks spread out / pushed to the right on every screen, but loading the same URL in a Safari TAB (or our 390px preview) renders perfectly.

**Cause:** in standalone mode there is no browser chrome, so once the document gets horizontally scrolled (by any element even a few px wider than the viewport — e.g. a wrapped flex grid on the home screen), iOS keeps it stuck scrolled to the right and the offset persists across navigations, so it looks like the *entire* app is shifted. A single overflowing screen makes all screens look shifted because the horizontal scroll position is document-level.

**Fix:** clamp the root elements so the document can never scroll horizontally:
`html, body, #root { width:100%; max-width:100%; overflow-x:hidden; }`.

**Do NOT add `viewport-fit=cover`.** It was tried and caused a regression: with `cover`, content goes full-bleed and the TOP slides under the status bar/notch on every screen (removing cover is what fixed the top). `react-native-safe-area-context`'s web impl reads `env(safe-area-inset-*)` and those are 0 UNLESS `cover` is set — so on web `useSafeAreaInsets()` returns 0 for top AND bottom regardless. Net: cover ON → top+bottom clip (full-bleed, insets still effectively 0/flaky); cover OFF → top is fine (browser contains the viewport below the status bar) but the **bottom home indicator still overlays** the tab bar labels + `MessageComposer`.

**Bottom-clip fix (cover stays OFF):** there is NO way to read the home-indicator height without `cover`, so use a fixed inset scoped to the installed PWA only. Hook `hooks/usePwaBottomInset.ts` returns `34` (iOS portrait home-indicator px) ONLY when `Platform.OS==="web"` AND iOS (UA `iPhone/iPad/iPod`, or `MacIntel`+touch for iPadOS) AND `display-mode: standalone` (or `navigator.standalone`); `0` everywhere else (native, browser tabs, desktop, Android). Apply it additively: web tab bar `height: 84 + pwaBottom, paddingBottom: pwaBottom` in `app/(tabs)/_layout.tsx` ClassicTabLayout; `MessageComposer` `paddingBottom: (insets.bottom>0?insets.bottom:10) + pwaBottom`. **Why a hook, not env():** env() needs cover, cover breaks the top — so a JS standalone-detect + fixed 34 is the only lever that fixes bottom without re-breaking top. Native is untouched (hook → 0; native uses real `insets.bottom`). Other bottom action bars (battle/group create/invite/topic) use the same `insets.bottom>0?…:<fallback>` pattern and will also clip in the iPhone PWA — reuse the hook there if the user reports them.

**Why injected in `scripts/build.js`, not `app/+html.tsx`:** `app/+html.tsx` is only consumed by Expo's STATIC web render (`web.output:"static"`). This app uses the default single-page (`single`) web output, where `+html.tsx` is silently ignored — verified: dev/export served HTML stays the built-in template. Switching to `static` pre-renders every route (risky for auth-gated routes), so instead `build.js` post-processes the exported `web-build/index.html` (idempotent, best-effort so a patch failure never blocks the deploy).

**How to apply / verify:**
- Web-only — does NOT touch native (APK/iOS) builds.
- Takes effect only after a **production redeploy** (build.js runs at deploy, not in dev).
- iOS caches the standalone shell aggressively: after redeploy the user must **delete the home-screen icon and re-add it**, or the old broken layout persists.
- Can't run `expo export -p web` on Replit to verify (OOMs in dev container); validate the patch by running the transform against the dev-served HTML instead.
