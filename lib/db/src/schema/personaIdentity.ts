import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Append-only history of a persona's archetype changes. The "identity" (archetype,
 * strengths, etc.) is *derived* data computed on demand from the persona's stats +
 * AI analysis — it is never persisted as state. This table is the one durable
 * record: a new row is inserted only when the freshly-computed archetype differs
 * from the latest stored one, so the table doubles as the source of truth for the
 * user's *current* archetype (the newest row) and their growth timeline.
 *
 * `archetype` stores the human-readable display name (e.g. "전략가형") so the
 * timeline renders without a lookup. `level` records the persona level at the
 * moment of change so the UI can show "Lv.5 관찰자형 → Lv.12 전략가형".
 */
export const personaIdentityHistoryTable = pgTable(
  "persona_identity_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /** Display name of the archetype at this point (e.g. "전략가형"). */
    archetype: text("archetype").notNull(),
    /** Persona level when this archetype became current. */
    level: integer("level").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("persona_identity_history_user_idx").on(table.userId, table.createdAt)],
);

export type PersonaIdentityHistory = typeof personaIdentityHistoryTable.$inferSelect;
