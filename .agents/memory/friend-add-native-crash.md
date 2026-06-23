---
name: Expo native module version mismatch crashes APK
description: "Cannot find native module 'X'" APK-only crash — root cause is an Expo SDK version mismatch, found via bundledNativeModules.json.
---

# Expo native module version mismatch → APK "Cannot find native module 'X'"

A screen hard-crashes the whole app **only in the built APK** (not Expo Go / web) with
`JavascriptException: Cannot find native module 'ExpoClipboard'` during expo-router
`loadRoute → SceneView`. The crash happens at **module-load** (an eager top-level
`import * as X from "expo-..."` runs `requireNativeModule` before render), so it is
**outside the React tree** and the root ErrorBoundary cannot catch it.

**Root cause:** the package's JS bundles fine (Metro always bundles an import), but its
**native module is absent from the APK** because the package version was pinned to a
version incompatible with the installed Expo SDK. The native side only links/registers
when the version matches the SDK.

**Why:** `expo-clipboard@7.0.1`, `expo-image-picker@16.0.6`, `expo-audio@1.0.16` were
left from an older SDK while the app is on Expo SDK 54, which wants `~8.0.8`, `~17.0.11`,
`~1.1.1`. (The `expo start` "packages should be updated" warning is the tell.)

**How to apply / diagnose:**
- The authoritative correct version per SDK is in
  `artifacts/mobile/node_modules/expo/bundledNativeModules.json` — this is exactly what
  `npx expo install <pkg>` uses. Compare every `expo-*` dep's *installed* version (not the
  package.json range string) against it; only **major.minor** mismatches matter
  (a `~`/`^` range that already resolved to the right version is fine).
- Fix: bump the package.json ranges to the bundled versions and `pnpm install` (updates
  lockfile + node_modules). Verify with the compare script, then `pnpm --filter
  @workspace/mobile run typecheck`.
- Defense-in-depth for crash-prone convenience features (e.g. clipboard copy): don't
  eagerly top-level import the native module — use a guarded dynamic
  `await import("expo-...")` inside the handler with a graceful fallback, so a future
  native-module gap degrades instead of killing the screen at load.
- Cannot be verified on Replit (no EAS/expo build allowed) — requires a fresh EAS APK on
  the user's machine. Other native modules linking fine does NOT prove a given one linked.
