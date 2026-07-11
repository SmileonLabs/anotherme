import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { starFeedPostsTable } from "./starFeed";
import { usersTable } from "./users";

export const DAILY_TALK_REWARD_STATUSES = ["PENDING", "GENERATED", "SAVED", "POSTED", "REWARDED", "FAILED"] as const;
export type DailyTalkRewardStatus = (typeof DAILY_TALK_REWARD_STATUSES)[number];

export const DAILY_TALK_REWARD_VISIBILITIES = ["PRIVATE", "FRIENDS", "PUBLIC"] as const;
export type DailyTalkRewardVisibility = (typeof DAILY_TALK_REWARD_VISIBILITIES)[number];

export interface DailyTalkRewardScores {
  empathy: number;
  communication: number;
  trust: number;
  positivity: number;
  contribution: number;
  spamRisk: number;
  qualityScore: number;
}

export interface DailyTalkRewardAbuseSignals {
  messageCount: number;
  userMessageCount: number;
  otherMessageCount: number;
  counterpartCount: number;
  repeatedMessageRatio: number;
  shortMessageRatio: number;
  selfMessageRatio: number;
  rewardMultiplier: number;
  reductions: string[];
}

export const dailyTalkRewardsTable = pgTable(
  "daily_talk_rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rewardDate: date("reward_date").notNull(),
    status: text("status").$type<DailyTalkRewardStatus>().notNull().default("PENDING"),
    title: text("title"),
    mood: text("mood"),
    keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
    diary: text("diary"),
    summary: text("summary"),
    scoresJson: jsonb("scores_json").$type<DailyTalkRewardScores>(),
    abuseJson: jsonb("abuse_json").$type<DailyTalkRewardAbuseSignals>(),
    grade: text("grade"),
    qualityScore: integer("quality_score").notNull().default(0),
    spamRisk: integer("spam_risk").notNull().default(0),
    pvtAmount: integer("pvt_amount").notNull().default(0),
    visibility: text("visibility").$type<DailyTalkRewardVisibility>().notNull().default("PRIVATE"),
    feedPostId: uuid("feed_post_id").references(() => starFeedPostsTable.id, { onDelete: "set null" }),
    idempotencyKey: text("idempotency_key").notNull(),
    rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("daily_talk_rewards_user_date_idx").on(t.userId, t.rewardDate),
    uniqueIndex("daily_talk_rewards_idempotency_key_idx").on(t.idempotencyKey),
    index("daily_talk_rewards_user_created_at_idx").on(t.userId, t.createdAt),
    index("daily_talk_rewards_feed_post_id_idx").on(t.feedPostId),
  ],
);

export type DailyTalkReward = typeof dailyTalkRewardsTable.$inferSelect;
