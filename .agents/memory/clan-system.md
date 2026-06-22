---
name: Clan system (가문)
description: Scope boundaries and invariants for the clan feature — what it must never touch.
---

# Clan system (가문)

Phase 5 shipped create/join/leave/lookup. Phase 6 added Clan Growth & Clan Identity. Phase 7 added read-only Clan Ranking. Phase 8 added Clan Memory (가문 기억). Phase 9 added Clan Wisdom (가문의 지혜). Still NO Clan War (forbidden).

## Invariants (do not break in later phases)
- **One active clan per user** is enforced at the DB level by a UNIQUE constraint on `clan_members.user_id`, plus service-level pre-checks inside transactions. Any "leave one / join another" flow must keep this UNIQUE valid (delete old membership before inserting new in the same tx).
- **Clan code must never write XP, persona stats, AI analysis, Persona Card, or Ranking.** It only *reads* persona `xp`/`stats` to derive display values via `computeLevel` + `computeIdentity`. This separation is a hard product requirement.
- **Member views are PII-whitelisted.** `loadMembers()` returns only `userId, displayName, avatarUrl, level, title, archetype, archetypeLabel, role, contributionExp`. Never select/expose `email`, `clerkId`, chat, or AI content.

## Conventions
- Archetype keys are the app's 8: strategist 전략가형, harmonizer 조율자형, explorer 탐험가형, pioneer 개척자형, sage 현자형, entertainer 재담꾼형, activist 행동가형, observer 관찰자형. (Spec draft used 탐구자형/엔터테이너형 — wrong; use these.)
- displayName format across persona-derived views: `${nickname}의 어나더 미`.
- Owner can leave only as the last member (that deletes the clan, cascading members); with other members present, owner is blocked (`owner_must_transfer`) — ownership transfer is a future phase.

## Clan growth (Phase 6)
- **Clan EXP delta = round(individualXp * 0.30) + flat bonus** (battle_win +20, dungeon_goal +30). Ranking Top10(overall) entry = flat +50, idempotent once per UTC day via `clan_members.lastRankBonusOn` (nullable date). See `clanExpForGrowth` / `awardClanRankTop10Bonus` in `clanGrowth.ts`.
- **Clan level curve is steeper than persona**: cumulative EXP to reach L = `1000*(L-1)*L/2` (L1→2 costs 1000, 2→3 costs 2000…). Distinct from persona `xpToReachLevel` (`50*(L-1)*L`). Don't confuse the two.
- **Clan growth must never block/rollback persona XP.** It runs as a side effect in its OWN tx AFTER the persona tx commits, gated on the `granted` (non-duplicate) flag, and `awardClanExp`/`awardClanRankTop10Bonus` swallow their own errors. Never move clan award inside the persona transaction.
- `contributionExp` accrues the SAME delta as the clan in the same tx (`applyClanExp` updates both clan exp/level and member contributionExp). Keep them coupled.
- `getClanIdentity` is read-only aggregate (clanPower mirrors ranking overall-score formula `level*1000 + xp + statSum*10` summed across members; dominant archetype = mode, tie-broken by `CLAN_ARCHETYPE_KEYS` order; topStrengths = top3 aggregate stats via `STAT_LABEL`). No PII, no AI, no writes.
- Ranking route hook fires `awardClanRankTop10Bonus` AFTER `res.json(result)` so the ranking payload shape is never touched (hard constraint).

## Clan ranking (Phase 7, read-only)
- `getClanRankings` in `clanRanking.ts` is pure-read (only `select`, no writes). The shared `computeClanMetrics` helper was extracted from `getClanIdentity` — getClanIdentity now delegates to it and its output must stay byte-identical. **Why:** ranking and identity must agree on clanPower/archetype/strengths; one formula, two callers.
- `score` is the type's primary metric (overall→clanPower, level→level, contribution→exp, average_level→averageLevel, archetype→clanPower). `pointsToNextRank = score(rank-1) - myScore`, 0 at rank 1. `myClanRank` is null when the user has no clan OR the clan is absent from the ranked set (e.g. archetype filter mismatch).
- **Candidate pool is capped (perf), so always force-include the caller's clan** before the final sort, or `myClanRank` can be falsely null for a real member. **Why:** caught in review — capping must never hide the caller. Also order the candidate query by the *true* stored metric for level/contribution so the capped pool is exact; other types use a memberCount/level/exp strength proxy (approximate only beyond the cap). A future season/cache/aggregate table can replace this live path.
- Route `GET /clans/rankings` MUST be registered before `GET /clans/:id` or it gets captured as an id lookup.

## Clan memory (Phase 8, 가문 기억)
- Memories are user-authored notes only (전략/교훈/가치/업적/경고). Service `clanMemory.ts` writes ONLY to `clan_memories`; never persona/clan-exp/ranking. No AI calls anywhere in this feature. **Why:** hard product constraint — memory is a passive store, not a growth input.
- **Never store raw transcripts/utterances/AI analysis.** Only the user-written `summary` + a `sourceId` reference (no transcript blob). View shaping is field-whitelisted (`ClanMemoryView`): no email/clerkId; `authorName` is nickname only.
- Permissions: create = any clan member; delete = author OR elder/owner; plain members cannot delete others'. Enforced in service, not just routes.
- `sourceKey` is unique+nullable → idempotent saves (same sourceKey returns existing row, no dup). Validation: title+summary required & length-capped, tags max 5.
- GET limit default 30 (route) / clamped max 100 (service); optional `type` filter.
- Home preview "top 3 by importance" must fetch a wide window (limit 100) then client-sort by `importanceScore` — server orders by createdAt, so sorting only the latest few would be wrong.
- Codegen gotcha: this is the first endpoint with BOTH a path param and query params, so orval emits a zod path-param schema `ListClanMemoriesParams` that collides with the react-query query-param type of the same name (TS2308). Fix: explicit disambiguation re-export in the stable barrel `lib/api-zod/src/index.ts` (`export { ListClanMemoriesParams } from "./generated/api"`). Re-apply if codegen is regenerated.

## Clan wisdom (Phase 9, 가문의 지혜)
- Read-only AI *summary* of existing Clan Memory + Clan Identity into 5 Korean fields (philosophy/strategy/values/culture/motto). `clanWisdom.ts` reads memories + `getClanIdentity` and writes ONLY `clan_wisdom`; never memories/persona/clan-exp/ranking. **Why:** wisdom is a derived read view, not a growth input — same hard constraint as memory.
- AI is NEVER realtime: one row per clan (UNIQUE `clan_id`, upsert via `onConflictDoUpdate`) regenerated ONLY on explicit owner/elder click. GET wisdom = any member; POST generate = owner/elder only. Both enforced in service, not just routes. Requires ≥1 memory (`no_memories` error) — empty clans cannot generate.
- **AI content rules are prompt-enforced AND there is a deterministic PII safety net**: after the model returns, `containsContactPII` rejects (returns null → `ai_failed`, nothing persisted) if output has an email or phone-like string. **Why:** prompt-only is not enough for a hard "no PII" constraint; political/religious/exaggeration stay prompt-only (not reliably regex-detectable, a 2nd AI pass would be over-engineering).
- `generatedByName` is nickname only (no email/clerkId). Fields clamped to 600 chars each.
- AI call: `gpt-5-mini`, chat.completions, `response_format` json_schema strict, `reasoning_effort: "minimal"`, `max_completion_tokens: 2000`; returns null on any failure (caller maps to friendly Korean error). DB column is literally `values` — fine, drizzle quotes identifiers.
