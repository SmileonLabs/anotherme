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
