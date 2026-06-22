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
