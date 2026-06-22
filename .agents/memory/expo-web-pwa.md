---
name: Expo web PWA / browser app reality
description: Why the Expo mobile artifact can't serve a real browser PWA out of the box, and what blocks building one here.
---

# Expo web / PWA on this project

- The Replit Expo artifact's **production deploy serves an "Open in Expo Go" launcher page** at its path (`/app/`), NOT a browser-runnable web app. `scripts/build.js` builds iOS/Android Expo Go bundles + manifests; `server/serve.js` serves a launcher HTML (`server/templates/landing-page.html`) + platform manifests. So visiting `/app/` in a browser shows the launcher, which users perceive as "the Expo Go screen".
- The landing artifact (`/`) hosts the PWA manifest/install button. Its `start_url` now points to `/app/`, so an installed PWA opens the Expo artifact path — which is still just the launcher until a real web build is served there.
- The app **code** is web-capable (react-native-web, `.web.ts` stubs/overrides, livekit-client for web voice, VAPID web push). The missing piece is a real web build being served, not code support.

## Hard blocker: web export OOMs in the dev container
- `expo export -p web` (Metro web bundle of the full app: livekit-client, firebase, reanimated, react-native-web, etc.) **cannot complete in the Replit dev container** — ~2 GB free RAM, **no swap**, while 4 dev workflows + LSP servers hold ~6 GB. Metro gets SIGKILL'd (no error, no exit code written, partial output like a stray `sw.js`).
- Tried: installing `@expo/metro-runtime` (was missing — required for web), `maxWorkers=1` (guarded by `EXPO_WEB_EXPORT=1` env in `metro.config.js`), lower Node heap, killing other servers. The workflow supervisor **auto-respawns** killed dev workflows, so you can't free memory that way. Still OOM'd every time (5 attempts).
- **Implication:** a real browser PWA would have to be built in the deployment build container (cleaner memory) — unverifiable locally — AND requires repurposing the expo artifact (rewrite build.js→web export, serve.js→static SPA, router expo-domain→path). High effort, uncertain, and browser calls/push are limited (esp. iOS).

**Why this matters:** Don't promise a quick "PWA install" for this app. For full-feature iPhone reach, an iOS EAS build (Apple Developer acct) is more reliable than a compromised browser PWA.

## Implemented: deploy-time web build (user chose this path)
- The mobile artifact's **production** scripts were repurposed to serve a real browser SPA at `/app/`:
  - `scripts/build.js` → `expo export -p web --output-dir web-build` (sets `EXPO_WEB_EXPORT=1` to cap Metro workers; inlines `EXPO_PUBLIC_DOMAIN` + Clerk key; **fails the build** if no Clerk publishable key, since `_layout.tsx` does `publishableKey!` and an empty key white-screens the app).
  - `server/serve.js` → serves `web-build/` as an SPA: strips `BASE_PATH` (`/app/`), serves files, 404s missing files **with extensions**, falls back to `index.html` only for extension-less routes (so `/status` health check returns 200). Long-caches `/_expo/` assets.
  - `app.json` `experiments.baseUrl = "/app"` (web-only; APK-safe). `artifact.toml` keeps `router = "expo-domain"` (changing it breaks the dev preview, which needs the Expo dev domain).
- **The actual `expo export` runs ONLY in the deployment build container** (dev OOMs) — so it's unverified until a real deploy. If the deploy build also OOMs, lower `maxWorkers` further or the export must move off-platform.
- **Known browser limitation (accepted by user):** web push needs a service worker the Expo export doesn't emit; `webPush.web.ts` registers `/sw.js` best-effort (try/catch, never throws on bootstrap) so push just stays off in-browser, esp. iOS Safari. Voice calls use `livekit-client` (web) but in-browser call wake/push is limited.
