---
name: Persona growth engine
description: Rules for the deterministic "Another Me" XP/stat growth that piggybacks on chat/battle/dungeon
---

"Another Me" personas grow from deterministic activity (chat, talk battle,
dungeon) — no AI, no per-message cost. A single server entry point applies an XP
event and rolls it up onto the persona.

**Rule 1 — never break core flows.** Growth is invoked fire-and-forget (`void`)
from message/battle/dungeon code, and the recorder swallows+logs all its own
errors. A growth failure must never delay or fail message delivery, battle
evaluation, or a dungeon turn.

**Rule 2 — keep persona updates atomic per user.** Applying an event is a
read-modify-write of `xp`/`stats`/`level`. It MUST run in one DB transaction that
locks the persona row (`FOR UPDATE`); the event-log insert and the persona bump
share that transaction.
**Why:** A user can trigger several events nearly simultaneously (e.g. a battle
turn that also ends the battle → turn + win events). A plain stale read-modify-
write drops gains (last-writer-wins) and can leave the append-only event log out
of sync with the rolled-up totals.

**Rule 3 — exclude bots.** Judge / Dungeon-Master / AI-persona users must not earn
growth. Battle code filters on `!isAI`; dungeon growth only fires on a real
player action (not the AI opening scene); chat growth only runs on the
authenticated sender route (system/bot messages are inserted server-side and
bypass it).
