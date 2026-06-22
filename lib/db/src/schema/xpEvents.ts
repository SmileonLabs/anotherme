import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import type { PersonaStats } from "./persona";

/**
 * Broad category of the activity that produced a growth event. Stored as text
 * (not an enum) so adding a category never requires a migration. `voice` and
 * `system` are reserved for future sources (voice calls, admin/system grants).
 */
export type GrowthSourceType =
  | "chat"
  | "battle"
  | "dungeon"
  | "voice"
  | "system"
  | "quest"
  | "achievement";

/**
 * Specific event within a source. One source can emit several event types
 * (e.g. battle → `battle_speech` and `battle_result`). Kept as text for the same
 * migration-free reason as `GrowthSourceType`.
 */
export type GrowthEventType =
  | "chat_message"
  | "battle_speech"
  | "battle_result"
  | "dungeon_action"
  | "dungeon_result"
  | "quest_reward"
  | "achievement_reward";

/**
 * Append-only log of every growth-granting activity. One row records the XP and
 * per-stat deltas applied plus the persona's level/XP before and after, so totals
 * are always auditable and re-derivable, and a history/timeline can be rendered
 * without recomputation.
 *
 * `sourceKey` is a deterministic idempotency key (e.g. `chat:{messageId}:{userId}`)
 * with a UNIQUE constraint: replaying the same activity inserts nothing and grants
 * nothing twice. `sourceId` is an opaque pointer (message/room id) kept as text to
 * avoid cross-table FK coupling. `metadata` holds extra structured context for
 * future AI analysis / family / ranking features.
 */
export const xpEventsTable = pgTable(
  "xp_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sourceType: text("source_type").$type<GrowthSourceType>().notNull(),
    sourceId: text("source_id"),
    sourceKey: text("source_key").notNull().unique(),
    eventType: text("event_type").$type<GrowthEventType>().notNull(),
    expDelta: integer("exp_delta").notNull().default(0),
    statChanges: jsonb("stat_changes").$type<Partial<PersonaStats>>(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    beforeLevel: integer("before_level").notNull().default(1),
    afterLevel: integer("after_level").notNull().default(1),
    beforeExp: integer("before_exp").notNull().default(0),
    afterExp: integer("after_exp").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Phase 2 AI analysis scans a user's events since lastAnalyzedAt; the persona
    // screen shows the most recent events newest-first.
    index("xp_events_user_id_created_at_idx").on(t.userId, t.createdAt),
  ],
);

export type XpEvent = typeof xpEventsTable.$inferSelect;
