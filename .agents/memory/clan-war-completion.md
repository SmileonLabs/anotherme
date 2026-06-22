---
name: Clan war completion concurrency
description: The claim/judge/finalize model that makes completeClanWar safe under concurrency and crashes.
---

# Clan war completion (`completeClanWar`)

The hard requirement: the AI judge runs **exactly once** per completion, the submission set is **frozen** while judging, rewards apply **exactly once**, and a war can **never get permanently stuck**. The AI call must happen OUTSIDE any DB transaction (it is slow and can fail), which is what makes this non-trivial. Solved with a transient `completing` claim status and three phases.

## The three phases
1. **Claim (txn, `FOR UPDATE`)** — re-lock the war row, verify it is `matched`/`active` with an opponent, then set `status = "completing"`. A second concurrent `/complete` sees `completing` and is rejected with a `conflict` ClanWarError. This single atomic transition is what guarantees the judge runs once: only the winner of this race proceeds. It also freezes submissions, because `submitClanWarArgument` only accepts `matched`/`active` — once the status is `completing`, no new submissions can land.
2. **Judge (NO txn)** — load the now-frozen submitted set, call the AI judge once, compute scores. On empty-side or AI failure, `restore()` sets status back to its pre-claim value (guarded by `status = "completing"` so it only rolls back its own claim) and rethrows.
3. **Finalize (txn, `FOR UPDATE`)** — re-lock, proceed only if `status === "completing"`, then write participant scores + result row, set `status = "completed"`, and apply the isolated rewards. The `status === "completing"` gate under the lock is what makes rewards idempotent: a re-`/complete` after success sees `completed` early and returns the existing detail without re-rewarding.

## Two recovery paths (added after architect review — both had real stuck-war risk)
- **Finalize transaction failure**: Phase C is wrapped in `try/catch`; on any DB error the claim already committed `completing`, so the catch calls `restore()` (rolls back to pre-claim `active`) and rethrows. Without this, a failed result-insert/reward-update would strand the war in `completing` forever. The rolled-back txn means NO partial reward was applied, so a retry re-judges and applies rewards exactly once.
- **Crash between claim and finalize**: `completing` is taken over if `updatedAt` is older than `WAR_COMPLETING_STALE_MS` (2 min). The claim txn re-stamps `completing` (bumping `updatedAt`) and proceeds with `prevStatus = "active"`. A *fresh* `completing` (< 2 min) is still rejected, so normal concurrent calls don't double-judge. Even if a slow (>2 min) original worker and a takeover overlap, Phase C's `FOR UPDATE` + `status === "completing"` gate still applies rewards exactly once (whoever commits first wins; the other no-ops).

**Why it's safe overall:** every bail path either finalizes to `completed` or restores to a re-runnable status; the AI judge is gated by the atomic claim; rewards are gated by the finalize lock. Idempotency is by status transition under a row lock — there is NO source_key ledger (none exists in this codebase).

## How to verify (E2E recipe)
Stub `getOpenAI().chat.completions.create` (count calls, optional delay/forced-failure). Drive create→accept→submit to reach `active`, then assert: AI-once under `Promise.allSettled` of two concurrent completes; submit+cancel blocked during `completing`; AI failure → rolls back to `active` + retry works; finalize failure (pre-insert a `clan_war_results` row to violate the UNIQUE `war_id`) → rolls back to `active`, no EXP, retry works; stale `completing` (force old `updatedAt`) → taken over, EXP once; fresh `completing` → rejected. Bundle with esbuild externalizing `pino`/`pino-pretty`/`thread-stream`/`@google-cloud/*`/`pg-native`, output the `.mjs` INTO the api-server dir, run with `NODE_ENV=production node`, then delete.
