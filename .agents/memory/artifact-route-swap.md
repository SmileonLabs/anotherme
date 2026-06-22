---
name: Artifact route swapping
description: How to swap two artifacts' previewPaths (e.g. move landing to / and an app off /) without DUPLICATE_PREVIEW_PATH, and why Expo BASE_PATH is safe to change mid-APK-build.
---

# Swapping artifact preview paths

When two artifacts need to trade routes (e.g. landing takes `/`, the occupant moves to `/app/`),
`verifyAndReplaceArtifactToml` enforces uniqueness eagerly and fails with `DUPLICATE_PREVIEW_PATH`
if you claim a path still held by another artifact.

**Rule:** apply the change that VACATES the contested path FIRST, then apply the one that claims it.
e.g. move mobile `/`→`/app/` before moving landing `/landing/`→`/`. Batching both in one block in the
wrong order fails on the first call (the vacate hasn't committed yet).

**Why Expo route moves are APK-safe:** the mobile `BASE_PATH` (in `artifact.toml` `services.env`) is
consumed only by the web build/serve scripts (`scripts/build.js`, `server/serve.js`) for URL
rewriting + path stripping. The native APK/EAS build is driven by `app.json` + EAS, never by
`BASE_PATH`. So changing an Expo artifact's route does NOT touch native packaging — safe to do even
while an off-platform EAS build is in flight.

**How to apply:** edit each `artifact.toml` (previewPath + service `paths` + `services.env.BASE_PATH`)
via a sibling temp `.edit.toml` + `verifyAndReplaceArtifactToml`, vacate-first ordering, then restart
both workflows. Verify with `curl localhost:80/`, `/app/`, `/api/healthz`.

**Side effect:** a web artifact moved to `/` registers its service worker at scope `/`, so it can
intercept sibling surfaces (`/app/`, `/api/*`). Network-first passthrough SWs are fine; cache-first
ones would need a narrower scope.
