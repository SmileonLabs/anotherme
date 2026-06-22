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
