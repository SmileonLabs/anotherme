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
