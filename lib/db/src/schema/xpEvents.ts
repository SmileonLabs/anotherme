import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import type { PersonaStats } from "./persona";

/**
 * The kinds of activity that grant deterministic growth. Kept as a string union
 * (stored as text) so adding a new source never requires an enum migration.
 */
export type XpSourceType =
  | "chat_message"
  | "battle_turn"
  | "battle_win"
  | "battle_loss"
  | "battle_draw"
  | "dungeon_turn"
  | "dungeon_goal";

/**
 * Append-only log of every growth-granting activity. One row per event records
 * the XP and per-stat deltas applied, so a persona's totals are always auditable
 * and (later) re-derivable. `refId` is an opaque source pointer (message/turn/
 * session id) kept as text to avoid cross-table FK coupling.
 */
export const xpEventsTable = pgTable(
  "xp_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sourceType: text("source_type").$type<XpSourceType>().notNull(),
    xpAmount: integer("xp_amount").notNull().default(0),
    statDeltas: jsonb("stat_deltas").$type<Partial<PersonaStats>>(),
    refId: text("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Phase 2 AI analysis scans a user's events since lastAnalyzedAt; the
    // persona summary screen may also show recent activity.
    index("xp_events_user_id_created_at_idx").on(t.userId, t.createdAt),
  ],
);

export type XpEvent = typeof xpEventsTable.$inferSelect;
