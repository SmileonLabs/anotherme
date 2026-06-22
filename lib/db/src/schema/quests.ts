import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Quest & Achievement retention layer (Phase 12). This system NEVER produces new
 * domain activity — it only OBSERVES existing activity (xp_events, clan_memories,
 * clan_wars, persona) to compute progress, and grants Persona EXP rewards through
 * the growth engine using a dedicated, idempotent source_key. It must never modify
 * the existing Persona XP / Clan XP / Ranking / Clan War / Clan Memory logic.
 */

/** daily | weekly */
export type QuestType = "daily" | "weekly";

/**
 * Per-user, per-period progress on a single quest. Recomputed on read from the
 * user's existing activity records and upserted. `periodKey` scopes a quest to a
 * day (`YYYY-MM-DD`, KST) or an ISO week (`YYYY-Www`, KST) so the same quest_key
 * resets each period. `completedAt` is set automatically when progress reaches
 * target; `rewardClaimedAt` is set ONLY when the user explicitly claims the
 * reward. The UNIQUE (user_id, quest_key, period_key) makes the upsert safe.
 */
export const questProgressTable = pgTable(
  "quest_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    questKey: text("quest_key").notNull(),
    /** daily | weekly */
    questType: text("quest_type").$type<QuestType>().notNull(),
    /** `YYYY-MM-DD` for daily, `YYYY-Www` for weekly (KST). */
    periodKey: text("period_key").notNull(),
    progress: integer("progress").notNull().default(0),
    target: integer("target").notNull().default(1),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    rewardClaimedAt: timestamp("reward_claimed_at", { withTimezone: true }),
    rewardExp: integer("reward_exp").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("quest_progress_user_quest_period_uniq").on(t.userId, t.questKey, t.periodKey),
    index("quest_progress_user_type_idx").on(t.userId, t.questType),
  ],
);

/**
 * A one-time achievement unlock per user. Unlock is computed on read from
 * existing activity; `unlockedAt` is the moment the unlock condition was first
 * observed. `rewardClaimedAt` is set ONLY when the user explicitly claims it. The
 * UNIQUE (user_id, achievement_key) makes the unlock upsert safe and prevents a
 * double unlock.
 */
export const achievementsTable = pgTable(
  "achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    achievementKey: text("achievement_key").notNull(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
    rewardClaimedAt: timestamp("reward_claimed_at", { withTimezone: true }),
    rewardExp: integer("reward_exp").notNull().default(0),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("achievements_user_key_uniq").on(t.userId, t.achievementKey)],
);

export type QuestProgress = typeof questProgressTable.$inferSelect;
export type Achievement = typeof achievementsTable.$inferSelect;
