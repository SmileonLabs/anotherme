---
name: Persona growth engine
description: Rules for the deterministic "Another Me" XP/stat growth that piggybacks on chat/battle/dungeon
---

"Another Me" personas grow from deterministic activity (chat, talk battle,
dungeon) — no AI, no per-message cost. A single server entry point applies an XP
event (append-only log) and rolls it up onto the persona.

**Rule 1 — never break core flows.** Growth is invoked fire-and-forget (`void`)
from message/battle/dungeon code, and the recorder swallows+logs all its own
errors. A growth failure must never delay or fail message delivery, battle
evaluation, or a dungeon turn.

**Rule 2 — atomic + idempotent per event.** Each growth call carries a
deterministic `sourceKey`; the events table has a UNIQUE constraint on it. The
recorder locks the persona row (`FOR UPDATE`), inserts the event with
`ON CONFLICT (source_key) DO NOTHING`, and only bumps the persona when the insert
actually produced a row — all in one transaction.
**Why:** Concurrent same-user events otherwise lose updates (stale read-modify-
write) and replays/double-fires double-grant. The unique key makes replays no-ops
and the row lock serializes concurrent grants.

**Rule 3 — sourceKey must be unique per *real* activity, including rematches.**
Battle keys embed `BattleState.matchSeq` (a per-room game counter incremented on
restart) so a legitimate rematch in the same room re-grants instead of colliding
on a per-room key. Dungeon goal keys embed the goal text (the DM prompt forbids
changing a goal's text once set, so it is a stable id). Any new source must pick a
key that is stable for one activity but distinct across legitimately repeatable
ones.

**Rule 4 — exclude bots.** Judge / Dungeon-Master / AI-persona users must not earn
growth. Battle filters on `!isAI`; dungeon growth only fires on a real player
action (not the AI opening scene); chat growth only runs on the authenticated
sender route.

## AI persona analysis (Phase 2)

On-demand only — the user presses "분석 업데이트"; there is NO per-message AI.
A single endpoint analyzes a bounded slice of recent activity and overwrites only
the persona's qualitative AI fields.

**Cost + abuse control.** Per-user 10-minute cooldown keyed off the persona's
`lastAnalyzedAt`, which is bumped ONLY on a successful analysis — so a failed
attempt does not lock the user out, but a success blocks re-runs. Each source is
independently capped and trivially short chat (< a few chars) is dropped.
**Why:** realtime analysis would be prohibitively expensive; cooldown + caps keep
one analysis to a single bounded model call.

**Failure isolation.** `analyzePersona` returns a result union
(cooldown / no_api_key / insufficient_data / ai_failed / ok) — it never throws to
the route. On ANY model failure (empty content, bad JSON, schema mismatch) it
leaves the existing persona analysis untouched (no partial writes). Missing API
key is detected by catching the `getOpenAI()` throw and surfaced as a friendly
message, distinct from a real AI failure.
**Why:** analysis must never crash or corrupt the persona; the user always gets a
soft Korean message.

**Estimative, non-diagnostic.** The prompt mandates: data is only in-app behavior
(not the whole person), everything is phrased as 추정/경향, sparse fields say
"데이터 부족", and sensitive attributes (politics, religion, health, sexuality,
criminal history) are never asserted. The mobile screen repeats this disclaimer.

**Server has no direct `zod`** — it bundles via esbuild and uses `@workspace/api-zod`.
Importing `zod/v4` directly in api-server code requires adding `zod` (catalog, v3.25+
ships the `/v4` subpath) to api-server's own deps or the esbuild bundle fails to
resolve it.

## Persona identity / archetype (Phase 3)

The "identity" (archetype, strengths, weaknesses, growth direction, card) is
**derived, never stored as state** — computed on demand from the persona's
deterministic stats. NO AI call: archetype is chosen by scoring rule-based
signature stat-pairs and picking the max, with a balanced "관찰자형" fallback when
total stat points are tiny. The AI analysis *result* is surfaced on the card only
as `personaSummary` (read from `persona.summary`); it does not drive archetype
selection. **Why:** the spec's concrete archetype rules are purely numeric and
keyword-matching on AI free-text is brittle.

**History-on-change is the source of current archetype.** `persona_identity_history`
gets a new row ONLY when the freshly-computed archetype differs from the latest
stored one, so the newest row IS the user's current archetype and the table is the
growth timeline. The latest-check + insert MUST run in a transaction behind a
`FOR UPDATE` row lock on the persona row (same pattern as growth's recordActivity)
— otherwise concurrent card fetches both read the same latest row and insert
duplicate consecutive archetype rows.

**Card fetch must stay read-only w.r.t. progression.** Building the card only ever
writes to `persona_identity_history`; it never touches xp/stats/level/xp_events.

## Persona ranking (Phase 4)

Leaderboards are a **read-only derived view** — no table, no season, no cache yet;
one live `personas ⨝ users` query enriched in-process with `computeLevel` +
`computeIdentity` (no AI). Kept service-shaped (`getRankings`) so a future
season/cache layer can wrap it without touching the route.

**Spec stat-name mapping:** the product spec's "설득력(persuasion)" → `conviction`
stat, "전략성(strategy)" → `decisiveness` stat (the app has no separate
persuasion/strategy stat). Overall score = `level*1000 + xp + totalStats*10`.
Stat rankings sort by that stat then tie-break `level > xp > userId`; archetype
ranking filters to one `archetypeKey`.

**Privacy is the load-bearing invariant.** Ranking rows expose ONLY
name/avatar/level/title/archetype(+label)/score/primaryStat (+userId, rank). The
query must select only non-sensitive columns — never email, AI-analysis text, or
chat/battle/dungeon content. An E2E test asserts the item key-set exactly.

**Archetype display labels differ from the spec wording:** the app uses
"탐험가형"(explorer) and "재담꾼형"(entertainer), NOT the spec's "탐구자형"/"엔터테이너형".
Mobile archetype filter chips must mirror the labels `computeIdentity` actually
produces, or filtering by key won't line up with what users see on their card.

## Quest / Achievement retention layer (Phase 12)

Quests/achievements are a **recompute-on-read** layer over EXISTING activity
(xp_events, clan_memories, clan_war_participants, persona.lastAnalyzedAt, clans) —
they never add new tracking calls into core flows. Rewards grant ONLY Persona EXP
via `recordReward` (sibling of recordActivity), which touches NO stats and NEVER
clan exp. **Why:** rewards are a self-contained layer; pulling clan exp into a
claim would double-count and violate the "don't touch clan XP" constraint.

**recordReward rethrows (unlike recordActivity which swallows).** A claim is
user-initiated and synchronous, so a real DB failure must surface as an error, not
silently mark a reward claimed without granting. recordActivity stays
fire-and-forget because it rides core flows.

**Two-source claim state — the xp_event source_key is the truth, `rewardClaimedAt`
is only a UI flag.** Grant (recordReward) and flag-stamp (update rewardClaimedAt)
are separate writes, so a crash between them can leave EXP granted but the row
unflagged. Fix: the claim flow stamps `rewardClaimedAt` whenever it `IS NULL`
*regardless* of whether this call granted — self-healing a prior partial claim.
Reward source_keys: `quest:{periodKey}:{questKey}:{userId}`,
`achievement:{achievementKey}:{userId}`.

**Recompute upsert must never clear `completedAt`.** Use
`coalesce(completed_at, <now-or-null>)` on conflict — writing a bare `null` when
the current recompute is below target would erase an earlier completion.
