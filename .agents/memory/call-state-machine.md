---
name: Voice call state machine invariants
description: Server-authoritative rules for the calls table transitions (ringing/active/declined/missed/cancelled/ended).
---

The `calls` route (`artifacts/api-server/src/routes/calls.ts`) is the authority for
call status. Two invariants are easy to violate and were the source of real bugs:

1. **The ~45s ring timeout must be enforced at EVERY mutation boundary**, not just on
   read paths. `maybeExpire()` (status-guarded ringing→missed) must run in `accept`
   and `GET /calls/incoming` too — otherwise a stale >45s ringing call could still be
   accepted/surfaced if no prior GET/join happened to expire it. The `incoming` query
   window (60s) is intentionally wider than the timeout (45s), so its rows MUST be run
   through `maybeExpire` and filtered to still-ringing.

2. **Every terminal transition must be compare-and-set guarded.** Reads followed by an
   unconditional `update ... where id=?` can clobber a concurrently-set terminal state
   (e.g. caller `/end` overwriting a callee `decline` → wrong "ended" card). Guard the
   write with `and(eq(id), eq(status, <the status you read>))`; if it returns no row,
   re-read and converge to the winner's state WITHOUT re-writing the chat call card
   (the winning handler already wrote the correct card via `endCallMessage`).

**Why:** "server-authoritative timeout" and correct final call-result cards both
depend on these; without them the UI shows wrong outcomes under normal races.

**How to apply:** Any new call-mutating endpoint must (a) respect/trigger expiry and
(b) use a status-guarded CAS update + converge-on-loss, mirroring `accept`/`end`.
