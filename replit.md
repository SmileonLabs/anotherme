# anotherme

AI가 판정하는 말발 배틀 앱 — 1:1/그룹 채팅, 던전 RPG, 토크배틀, 음성통화를 갖춘 한국어 소셜 앱.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080)
- Mobile: Expo (React Native) — `artifacts/mobile`
- DB: PostgreSQL + Drizzle ORM
- Auth: Clerk (`@clerk/expo` on mobile, `@clerk/express` on server)
- AI: OpenAI (`OPENAI_API_KEY`) — dungeon RPG & talk battle judging
- Voice: LiveKit — web/PWA via `livekit-client`; native via `@livekit/react-native` + `@livekit/react-native-webrtc` (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`)
- Push: Web Push / VAPID (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`)
- Storage: Replit Object Storage (GCS-backed)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/landing/` — react-vite marketing/landing page (slug `landing`, served at `/landing/`). 3 CTAs: PDF download (`public/anotherme.pdf`), Android APK (`src/config.ts` → `APK_URL`, swap to direct .apk URL once EAS build finishes), PWA install (`beforeinstallprompt` + iOS manual-install fallback modal). Installable PWA: `public/manifest.webmanifest` (relative `start_url`/`scope` so it's base-path-portable), `public/sw.js`, `public/icon-{192,512}.png`. All public-asset refs use `import.meta.env.BASE_URL` — never hardcode `/landing/`.
- `artifacts/mobile/` — Expo app (screens, components, hooks, lib, constants)
- `artifacts/mobile/app/` — Expo Router screens
- `artifacts/mobile/app/(auth)/` — sign-in / sign-up screens
- `artifacts/mobile/app/(tabs)/` — main tab navigation
- `artifacts/mobile/app/chat/[id].tsx` — chat room screen
- `artifacts/mobile/app/battle/` — talk battle screens
- `artifacts/mobile/app/dungeon/` — dungeon RPG screens
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/` — server utilities (auth, AI, push, storage, etc.)
- `lib/db/src/schema/` — Drizzle ORM schema (source of truth for DB)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `lib/api-client-react/` — generated React Query hooks
- `lib/api-zod/` — generated Zod schemas

## Architecture decisions

- Clerk proxy (`/api/__clerk`) is production-only; dev mode loads Clerk from CDN directly. `EXPO_PUBLIC_CLERK_PROXY_URL` must NOT be set in shared/dev env — only production.
- OpenAI client (`aiClient.ts`) falls back: `AI_INTEGRATIONS_OPENAI_API_KEY` → `OPENAI_API_KEY`. Use `OPENAI_API_KEY` secret directly.
- Object Storage uses Replit sidecar auth (no GCS credentials needed); bucket ID in `DEFAULT_OBJECT_STORAGE_BUCKET_ID`.
- Mobile lib helpers (`artifacts/mobile/lib/`) have `.web.ts` platform-specific overrides for browser-incompatible APIs (HEIC conversion, voice calls, web push, call notifications, native push).
- All DB tables are defined in `lib/db/src/schema/`; run `pnpm --filter @workspace/db run push` after schema changes.
- Voice calls are dual-platform: PWA/web uses `livekit-client` + Web Push (`voiceCall.web.ts`); native build uses `@livekit/react-native` (`voiceCall.ts`) with `registerGlobals()` + `AudioSession`, plus notifee full-screen incoming UI (`callNotifications.ts`) and `@react-native-firebase/messaging` for FCM token + foreground messages (`nativePush.ts`) and the killed/background handler (`lib/fcmBackground.ts`, registered from the custom `index.js` entry). All native files have `.web.ts` no-op stubs so the PWA keeps building.
- Native FCM uses `@react-native-firebase/messaging`, NOT `expo-notifications` (which was removed). Two FCM consumers fight over the message — pick one. The custom entry (`index.js` → `main` in `package.json`) imports `lib/fcmBackground` (registers `setBackgroundMessageHandler`) BEFORE `expo-router/entry`; never point `main` back at `expo-router/entry` directly. `@react-native-firebase/app` must be in `app.json` `plugins` AND pnpm-installed or `expo` crashes at config resolution.

## Native build (Android APK / iOS) — Phase B

The native voice-call foundation is **scaffolding only** — it cannot be built or verified on Replit. Building requires EAS off-platform.

- **Config plugins (required):** `@livekit/react-native-expo-plugin`, `@config-plugins/react-native-webrtc`, and `@react-native-firebase/app`. These are listed in `app.json` `plugins` and MUST stay installed — if missing, `expo start` fails at config resolution (`PluginError: Failed to resolve plugin`).
- **Static `app.json` only** — never convert to `app.config.ts` (Replit-managed config requirement).
- **EAS build:** `eas.json` defines `development`/`preview` (APK) and `production` (AAB) profiles. Run `eas build` from a local machine / CI with an Expo account — **never run `eas`/`expo build`/`expo prebuild` CLI on Replit** (forbidden by the expo skill).
- **FCM (Android push):** `google-services.json` (client) must be the real Firebase project file (`anotherme-d2a7c`) before any native build. High-priority FCM data messages are required to wake the device for full-screen incoming calls.
- **Server-side native push is implemented (Phase 3).** `lib/fcm.ts` uses `firebase-admin` to send high-priority **data-only** FCM messages (no `notification` block — see below); `sendCallPush` now fires BOTH Web Push (VAPID) and native FCM. Native FCM device tokens (from `@react-native-firebase/messaging` `getToken()`, raw — not Expo tokens) register via `POST /users/me/push-token`; `addSubscription` routes non-web-push tokens to `addFcmToken`, stored in `users.fcmTokens` (JSON string array, separate from `pushToken`). Requires the **`FIREBASE_SERVICE_ACCOUNT`** secret (service-account JSON); without it FCM is a safe no-op (like VAPID-less web push). Stale/invalid tokens are auto-pruned on send.
- **Killed-state full-screen incoming call is implemented (Phase 4).** The server sends **data-only** high-priority FCM (NO `notification` block — a notification payload makes Android route to the system tray and skip the JS handler when killed). `lib/fcmBackground.ts` registers `@react-native-firebase/messaging` `setBackgroundMessageHandler` at the entry, which calls notifee `displayIncomingCallNotification` (`fullScreenAction`) to render over the lock screen. Foreground messages go through `messaging().onMessage` (`nativePush.ts`); accept/decline taps in the killed/background context are handled by `notifee.onBackgroundEvent` (registered when `callNotifications.ts` loads) and persisted to AsyncStorage for cold-start replay. **Tradeoff:** data-only means if the background handler can't run (force-stopped app / aggressive battery optimization) nothing shows — inherent to the full-screen-call pattern. Verifiable only via an EAS build on a real device.
- **iOS** additionally requires CallKit + PushKit/VoIP entitlements and a paid Apple Developer account; `app.json` has `UIBackgroundModes: [audio, voip]` + mic usage description scaffolded, but iOS incoming-call UI is not implemented.

## Product

- **1:1 / 그룹 채팅** — 실시간 폴링, 파일/이미지 첨부, 스티커
- **던전 RPG** — AI 던전마스터가 진행하는 그룹 텍스트 어드벤처
- **토크배틀** — AI 심판이 점수를 매기는 2인 말발 배틀
- **음성통화** — LiveKit 기반 1:1 음성통화
- **친구 관리** — 친구 추가/요청/차단
- **푸시 알림** — Web Push (VAPID) 기반

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `EXPO_PUBLIC_CLERK_PROXY_URL` must only be set in **production** env, not shared. Setting it in shared causes Clerk JS to fail loading in dev (attempts to proxy through `/api/__clerk/npm/...` which returns 404).
- Expo packages (`expo-clipboard`, `expo-image-picker`) have version warnings but are functional; update when upgrading Expo SDK.
- After any schema change in `lib/db/src/schema/`, run `pnpm --filter @workspace/db run push` AND restart the API server workflow.
- After any OpenAPI spec change, run `pnpm --filter @workspace/api-spec run codegen` before touching route/client code.
- Do NOT use `console.log` in server code — use `req.log` in route handlers, `logger` elsewhere.
- Any plugin listed in `app.json` `plugins` must be pnpm-installed in `artifacts/mobile`, or `expo start` (and the mobile workflow) crashes at config resolution with `PluginError: Failed to resolve plugin`. Adding native runtime libs without their config plugins (e.g. LiveKit + `@livekit/react-native-expo-plugin`) is a common cause.
- Mobile workflow restart can transiently fail with a Metro file-watch `ENOENT ... is-array-buffer_tmp_*` error right after a pnpm install (watcher races a deleted install temp dir). Re-restart; if it persists, the real error is usually masked underneath — run `cd artifacts/mobile && pnpm exec expo config --type prebuild` to surface it.
- `firebase-admin` pulls in `@opentelemetry/api`, which makes `drizzle-orm` resolve as TWO peer-variants (with/without opentelemetry). This breaks api-server typecheck with `SQL<unknown>` "separate declarations of a private property 'shouldInlineParams'" / protected `config` errors — `@workspace/db`'s tables and the consumer's `eq()` come from different drizzle copies. Fix: pin `@opentelemetry/api` (same version) as a dep of `@workspace/db` so both consumers resolve the same drizzle variant.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
