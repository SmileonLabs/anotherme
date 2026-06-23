---
name: Push notifications (PWA web-push + APK native FCM)
description: How web push (VAPID) and native Android FCM are wired, and the config/path gotchas that silently break each.
---

# Push notifications — two independent channels

The app has TWO unrelated delivery channels; a user can have either or both:
- **PWA / web** → Web Push (VAPID), `web-push` lib, server `lib/push.ts`.
- **APK / native Android** → FCM (`firebase-admin`), server `lib/fcm.ts`.

`sendPushToUser` fires BOTH (web + native general notification) for regular
notifications (messages, friend requests, dungeon invites). `sendCallPush` fires
web push + a SEPARATE data-only full-screen native call FCM (`sendFcmCallToUser`).

## Silent breakers (each makes push look "totally dead")

- **Web client needs the VAPID PUBLIC key under an `EXPO_PUBLIC_` name.** Server
  reads `VAPID_PUBLIC_KEY`; the web client (`webPush.web.ts`) reads
  `process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY`. If only the server-side name exists,
  the client subscribes with an empty key → every web-push call no-ops and no one
  ever subscribes. Fix: set a SHARED env var `EXPO_PUBLIC_VAPID_PUBLIC_KEY` equal
  to the (public-by-design) VAPID public key. `EXPO_PUBLIC_*` are inlined at web
  export (build.js spreads `process.env`) AND read at dev runtime.
  **Why:** the public key is shipped to every browser anyway — copying it is not a
  leak; Expo only inlines `EXPO_PUBLIC_`-prefixed vars into the client bundle.

- **Service worker must register under the artifact base path (`/app/`), not `/`.**
  The mobile web app is mounted at `/app/` (artifact previewPath; build.js injects
  `experiments.baseUrl=/app`; serve.js serves `web-build` under `BASE_PATH=/app/`).
  `public/sw.js` therefore lives at `/app/sw.js`. Registering `"/sw.js"` scope `"/"`
  fails twice: wrong file path AND a scope a `/app/`-served SW can't claim →
  registration silently throws (caught) → push permanently off. Fix: derive base
  (`EXPO_BASE_URL`, else from the `/_expo/` script src, else `/`) and register
  `${base}sw.js` with `scope: base`.
  **How to apply:** any SW / manifest / web-push path in this app must be base-path
  relative, never root-absolute — same rule as the landing PWA assets.

- **Native general notifications must NOT name a non-existent Android channel.**
  `sendFcmNotificationToUser` sends a `notification` block (Android auto-displays).
  The app only registers the `incoming-calls` notifee channel; naming
  `channelId:"default"` (or any unregistered channel) suppresses display on
  Android 8+. Omit `channelId` → FCM uses its auto-created fallback channel.

## Calls vs regular notifications (don't double-notify native)

`sendCallPush` already sends the native call FCM, and it also calls
`sendPushToUser`. So `sendPushToUser` SKIPS the native general send when
`payload.type === "call"`, otherwise a call would hit native devices twice (tray +
full-screen). Native general send is NOT gated on VAPID being configured (separate
credentials) — don't reintroduce an early `if(!configured) return` at the top of
`sendPushToUser`.

## Verification reality

- PWA web push is only verifiable in the deployed `/app/` PWA after **redeploy +
  delete & reinstall the home-screen icon** (iOS caches the standalone shell; SW
  also re-registers fresh). iOS standalone push needs iOS 16.4+.
- APK FCM is **only** verifiable on a real EAS device build — cannot be tested on
  Replit. Server config needs `FIREBASE_SERVICE_ACCOUNT`; the APK needs the real
  `google-services.json` (project `anotherme-d2a7c`, pkg `com.anotherme.app`).

## Gaps still open (not yet wired to any push)

Talk-battle invites, clan-war turns, achievements/quests, and battle-turn nudges
send no push at all (no `sendPushTo*` call at those trigger points).
