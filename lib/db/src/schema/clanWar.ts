import { index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { clansTable } from "./clan";
import { usersTable } from "./users";

/**
 * Clan War ("가문전") — an asynchronous, talk-battle-style competition between two
 * clans on a single topic. A challenger clan's owner/elder creates a war (either
 * targeting a specific opponent or as a public challenge). Members of each side
 * join and submit a short written argument. At completion the server asks the AI
 * judge ONCE to score every submission, derives each clan's score (top-3 average),
 * records the winner, and applies small, isolated clan-EXP rewards.
 *
 * This system is fully self-contained: it NEVER modifies the existing talk-battle
 * logic, Persona XP, the existing Clan-EXP logic, Clan Ranking, Clan Memory, or
 * Clan Wisdom. Raw submissions are stored only so the judge can read them — they
 * are never exposed to other members via the API; only AI summaries are surfaced.
 */
export const clanWarsTable = pgTable(
  "clan_wars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topic: text("topic").notNull(),
    /** open | matched | active | completing | completed | cancelled */
    status: text("status").notNull().default("open"),
    challengerClanId: uuid("challenger_clan_id")
      .notNull()
      .references(() => clansTable.id, { onDelete: "cascade" }),
    /** Null while a public challenge is still open. */
    opponentClanId: uuid("opponent_clan_id").references(() => clansTable.id, {
      onDelete: "cascade",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    winnerClanId: uuid("winner_clan_id").references(() => clansTable.id, {
      onDelete: "set null",
    }),
    challengerScore: integer("challenger_score").notNull().default(0),
    opponentScore: integer("opponent_score").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("clan_wars_status_idx").on(t.status),
    index("clan_wars_challenger_idx").on(t.challengerClanId),
    index("clan_wars_opponent_idx").on(t.opponentClanId),
  ],
);

/**
 * A single member's participation in a clan war. One row per (war, user). `side`
 * records which clan they fight for. `submission` is the raw argument (read by the
 * judge, never broadcast to other members). `score` (0–50) and `contributionSummary`
 * are filled in by the judge at completion.
 */
export const clanWarParticipantsTable = pgTable(
  "clan_war_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    warId: uuid("war_id")
      .notNull()
      .references(() => clanWarsTable.id, { onDelete: "cascade" }),
    clanId: uuid("clan_id")
      .notNull()
      .references(() => clansTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /** challenger | opponent */
    side: text("side").notNull(),
    /** The member's argument. Stored for judging only; never exposed to others. */
    submission: text("submission"),
    score: integer("score").notNull().default(0),
    /** Short AI per-participant note (no PII). Filled at completion. */
    contributionSummary: text("contribution_summary"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("clan_war_participants_war_user_uniq").on(t.warId, t.userId),
    index("clan_war_participants_war_idx").on(t.warId),
    index("clan_war_participants_clan_idx").on(t.clanId),
  ],
);

/**
 * The AI judge's verdict for a completed war: one row per war. Holds only summary
 * text — never raw submissions. Contact PII is filtered out before persistence.
 */
export const clanWarResultsTable = pgTable("clan_war_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  warId: uuid("war_id")
    .notNull()
    .unique()
    .references(() => clanWarsTable.id, { onDelete: "cascade" }),
  judgeSummary: text("judge_summary").notNull(),
  challengerFeedback: text("challenger_feedback").notNull(),
  opponentFeedback: text("opponent_feedback").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const CLAN_WAR_STATUSES = [
  "open",
  "matched",
  "active",
  "completing",
  "completed",
  "cancelled",
] as const;
export type ClanWarStatus = (typeof CLAN_WAR_STATUSES)[number];

export const CLAN_WAR_SIDES = ["challenger", "opponent"] as const;
export type ClanWarSide = (typeof CLAN_WAR_SIDES)[number];

export type ClanWar = typeof clanWarsTable.$inferSelect;
export type ClanWarParticipant = typeof clanWarParticipantsTable.$inferSelect;
export type ClanWarResult = typeof clanWarResultsTable.$inferSelect;
