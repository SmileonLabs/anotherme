---
name: Expo web push / service worker deployment reality
description: Why browser service workers & web push only work in the dev web preview, not the production manifest deploy.
---

The mobile app's PRODUCTION deploy is an **Expo Go manifest deployment**, not a web
PWA bundle. `scripts/build.js` downloads native iOS/android Metro bundles + manifests
into `static-build/`, and `server/serve.js` serves the platform manifest JSON + an
Expo-Go landing page at `/`. There is no `index.html` web app and no browser loading
the web bundle in production.

**Consequence:** anything that depends on a browser runtime — a service worker at
`/sw.js`, the Web Push / `PushManager` API, `navigator.serviceWorker.ready` — only
works in the **dev web preview** (`expo start` web, served by Metro which does serve
`public/`). It does **not** apply to the manifest production deploy. Copying `sw.js`
into `static-build/` would NOT fix this, because Expo Go is not a browser.

**Why:** Phase A "PWA MVP" web push is therefore a dev/preview-grade feature only.
The real production background-incoming-call path is **native FCM (Phase B)** with a
custom dev build / EAS APK — Expo Go cannot deliver high-priority data pushes either.

**How to apply:** Don't over-promise web push reliability in production, and don't
waste effort wiring `sw.js` into the static build. Keep web-push code gated behind
`webPushSupported` (best-effort, swallow errors) so it degrades gracefully, and route
real production push through native FCM.

## iOS standalone PWA first-cold-launch layout traps
- Never freeze viewport size at module scope (`const {width}=Dimensions.get('window')`). On a freshly-installed iOS home-screen PWA the first JS eval can read a wrong/0 size and it stays frozen all session → layout breaks until the app is killed & relaunched. Use `useWindowDimensions()` (reactive) and include that width in any `useCallback` deps that compute offsets.
- Bottom-anchored UI in a flex column (footer CTA, tab bar) must be pinned: give the scroll/content area `flex:1` so the footer can't be pushed below the viewport.
- `usePwaBottomInset` starts at 0 and only flips to 34 after first paint via matchMedia/`navigator.standalone`; on first cold launch detection can settle late. Recompute on resize/orientationchange/pageshow/visibilitychange + deferred re-checks, else the tab bar stays clipped under the home indicator until relaunch.
