---
name: Native FCM push (server)
description: How server-side native Android push works and the drizzle/firebase-admin pitfall it introduced.
---

# Server-side native FCM push

The app delivers incoming-call pushes on TWO independent channels: Web Push (VAPID, `push.ts`) for PWA/web, and native FCM (`firebase-admin`, `fcm.ts`) for the Android build. `sendCallPush` fires both.

- Mobile registers a **raw device token** (`@react-native-firebase/messaging` `getToken()`, not an Expo push token) via `POST /users/me/push-token`. `addSubscription` routes anything that isn't a valid web-push subscription object to native FCM storage (`users.fcmTokens`, a JSON string array kept separate from `pushToken`).
- Requires the `FIREBASE_SERVICE_ACCOUNT` secret (service-account JSON). Absent → safe no-op, exactly like VAPID-less web push.

**Rule: only prune FCM tokens on `messaging/registration-token-not-registered` or `messaging/invalid-registration-token`.**
**Why:** `messaging/invalid-argument` can mean a malformed *payload*, not a dead token — if you prune on it, a payload bug makes every device error and wipes the user's entire token list.
**How to apply:** any new FCM send path must keep this narrow pruning classification.

## firebase-admin ↔ drizzle-orm peer-variant clash
**Why:** `firebase-admin` pulls in `@opentelemetry/api`, an optional peer of `drizzle-orm`. That makes drizzle resolve as two peer-variants (with/without opentelemetry), so `@workspace/db`'s table types and a consumer's `eq()`/`SQL` come from different drizzle copies → typecheck fails with `SQL<unknown>` "separate declarations of a private property 'shouldInlineParams'" / protected `config`.
**How to apply:** pin `@opentelemetry/api` (same version, currently 1.9.1) as a dep of `@workspace/db` so every drizzle consumer resolves the same variant. Watch for this whenever a new server dep drags in opentelemetry.

## Killed-state full-screen: DATA-ONLY is mandatory
**Rule:** the server call push must be **data-only** (no FCM `notification` block). A `notification` payload makes Android deliver to the system tray and SKIP the JS `setBackgroundMessageHandler` when the app is killed — so the notifee full-screen never renders.
**Why:** this is the whole mechanism for killed-state full-screen-over-lockscreen; `notification`+`data` silently breaks it (works only when app is foregrounded).
**How to apply:** keep `fcm.ts` send as `{ token, data, android: { priority: "high" } }`. The handler lives in mobile `lib/fcmBackground.ts`, imported by the custom `index.js` entry BEFORE `expo-router/entry`.

## One FCM consumer only — RN-firebase, not expo-notifications
**Rule:** native FCM is owned by `@react-native-firebase/messaging` (token via `getToken()`, foreground via `onMessage`, killed via `setBackgroundMessageHandler`). `expo-notifications` was REMOVED (dep + plugin).
**Why:** two libraries both register an FCM service and fight over message delivery, making killed-state delivery unreliable.
**How to apply:** don't re-add `expo-notifications` for push. `@react-native-firebase/app` must be in `app.json` `plugins` AND pnpm-installed (autolinking + config plugin) or `expo` crashes at config resolution.
