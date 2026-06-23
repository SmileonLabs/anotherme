---
name: Dev vs prod database separation (this project)
description: Whether development testing pollutes the live production database, and why prod data looked identical to dev.
---

# Dev and prod use SEPARATE databases (Replit auto-managed)

Verified via `SELECT current_database(), inet_server_addr()`:
- **development** → `heliumdb` (Replit-local managed PG, no inet addr)
- **production** → `neondb` @ `169.254.254.254:5432` (Neon-backed prod DB)

They are physically different databases. There is ONE `DATABASE_URL` secret in the
dev env and NO prod override in `artifact.toml`, yet prod resolves to a different DB —
because Replit **automatically swaps `DATABASE_URL` in the deployed app** to point at the
production database. The app just reads `process.env.DATABASE_URL`.

**Why prod data can look identical to dev:** at Publish time Replit offers an
"overwrite data" option that copies dev data → prod wholesale. If chosen (or at first
publish), prod ends up with a snapshot of dev. After that, dev test accounts do NOT leak
into prod unless the user picks "overwrite data" again on a later publish.

**How to apply:**
- Do NOT manually provision a second DB or hack `DATABASE_URL` to "separate" them — they
  already are. (See database-migrations-on-publish reference: agent must not do this.)
- Production is READ-ONLY via `executeSql({environment:"production"})` — cannot delete prod
  rows from the agent. To clean prod data the user must do it in-app or via the Publish UI.
- Schema changes reach prod only via the Publish flow's dev→prod diff, not by any script.
