import { integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Per-user lifetime talk-battle stats. One row per user, created/updated when a
 * battle they participated in ends. AI persona bots never get a row (only human
 * participants are recorded). Level and title are derived from `mp` at read time
 * (see `battleLevelInfo`), so only the durable counters live here.
 */
export const userBattleStatsTable = pgTable("user_battle_stats", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  /** Consecutive wins; reset to 0 on a loss or draw. */
  currentStreak: integer("current_streak").notNull().default(0),
  /** Highest `currentStreak` ever reached. */
  bestStreak: integer("best_streak").notNull().default(0),
  /** "Mal-bbal points" accumulated across battles; drives level/title. */
  mp: integer("mp").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type UserBattleStats = typeof userBattleStatsTable.$inferSelect;
