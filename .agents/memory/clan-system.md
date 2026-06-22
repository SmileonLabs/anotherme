---
name: Clan system (가문)
description: Scope boundaries and invariants for the clan feature — what it must never touch.
---

# Clan system (가문)

Phase 5 shipped create/join/leave/lookup ONLY. No Clan War, Clan Memory, or Clan Ranking.

## Invariants (do not break in later phases)
- **One active clan per user** is enforced at the DB level by a UNIQUE constraint on `clan_members.user_id`, plus service-level pre-checks inside transactions. Any "leave one / join another" flow must keep this UNIQUE valid (delete old membership before inserting new in the same tx).
- **Clan code must never write XP, persona stats, AI analysis, Persona Card, or Ranking.** It only *reads* persona `xp`/`stats` to derive display values via `computeLevel` + `computeIdentity`. This separation is a hard product requirement.
- **Member views are PII-whitelisted.** `loadMembers()` returns only `userId, displayName, avatarUrl, level, title, archetype, archetypeLabel, role, contributionExp`. Never select/expose `email`, `clerkId`, chat, or AI content.

## Conventions
- Archetype keys are the app's 8: strategist 전략가형, harmonizer 조율자형, explorer 탐험가형, pioneer 개척자형, sage 현자형, entertainer 재담꾼형, activist 행동가형, observer 관찰자형. (Spec draft used 탐구자형/엔터테이너형 — wrong; use these.)
- displayName format across persona-derived views: `${nickname}의 어나더 미`.
- Owner can leave only as the last member (that deletes the clan, cascading members); with other members present, owner is blocked (`owner_must_transfer`) — ownership transfer is a future phase.

## Future Clan XP / Ranking hookpoints
- `clansTable.exp` / `clansTable.level` and `clanMembersTable.contributionExp` already exist (seeded at 0) — these are the columns a future Clan XP/Ranking phase aggregates into. They are display-only today; nothing increments them yet.
