---
name: Avatar default-avatar null-name crash
description: Why screens listing the full user directory crash on Avatar but friend/me-scoped screens don't.
---

# Avatar default-avatar crash on null/empty name

`Avatar` (artifacts/mobile/components/Avatar.tsx) falls back to a deterministic default
animal avatar by hashing `name` (`name.charCodeAt(i)`). If `name` is null/undefined the
hash loop throws and the whole screen crashes (no JS ErrorBoundary catch on native →
APK hard-crash).

**Why it only bit the friend-add screen:** friends/me-scoped screens pass safe names
(`me?.nickname ?? "?"`, friend rows always have a nickname). The friend-add screen lists
the **entire user directory** via `/api/users`, which can include accounts with a
null/empty `nickname` → first such row crashes on mount-after-fetch. Server logs look
clean (the API returns 200); the crash is purely client-side render.

**How to apply:** any component that renders arbitrary/all-users data (not just the
current user or their friends) must treat nullable profile fields (`nickname`,
`profileImageUrl`) as actually nullable. `defaultAvatarFor` now coerces `name || "?"`.
Keep that guard; don't trust the `name: string` prop type at runtime.
