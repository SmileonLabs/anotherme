---
name: Android resource merge conflict (EAS Gradle)
description: EAS Android build fails at :app:mergeReleaseJavaResource with "N files found with path META-INF/..." — duplicate resource fix via expo-build-properties.
---

# Symptom
EAS Android build dies in the "Run gradlew" phase. EAS surfaces only a generic
"Gradle build failed with unknown error" — the real cause is ABOVE the
"performance profile available" footer line: a `FAILURE: ... Execution failed for
task ':app:mergeReleaseJavaResource'` block reporting `N files found with path
'META-INF/...'` from two different jars (here: okhttp3 logging-interceptor + org.jspecify).

# Why
Two dependency jars ship the same resource path (e.g. `META-INF/versions/9/OSGI-INF/MANIFEST.MF`).
Android's resource merger refuses to pick one automatically → build stops.

# Fix (Expo managed — no prebuild on Replit)
Add `expo-build-properties` (install at SDK-matched version via `expo install`, and it
MUST be installed because it's a config plugin) and configure packaging in `app.json`:
```
["expo-build-properties", { "android": { "packagingOptions": { "exclude": ["META-INF/versions/9/OSGI-INF/MANIFEST.MF", "META-INF/**/OSGI-INF/MANIFEST.MF"] } } }]
```

**Prefer `exclude` over `pickFirst` for these OSGi/versioned META-INF manifests.**
**Why:** a `pickFirst` on the exact path was tried first and the SAME duplicate-path
failure recurred in the next real EAS build (`mergeReleaseJavaResource`) — pickFirst did
not resolve it. `exclude` drops the file entirely (it's OSGi metadata, useless at Android
runtime) and is definitive. The `META-INF/**/OSGI-INF/MANIFEST.MF` glob also pre-empts
other libs shipping the same kind of versioned manifest. Add more exclude paths if a
*different* duplicate path appears in later builds.

# Verify on Replit (can't run EAS here)
`pnpm exec expo config --type prebuild` from `artifacts/mobile` — confirm the
`packagingOptions.exclude` shows in the resolved config and exit 0. The actual APK
rebuild must run off-platform via `eas build`.
