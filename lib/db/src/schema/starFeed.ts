import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { starProfilesTable } from "./fanStar";
import { characterProfilesTable } from "./characterProfiles";

export const STAR_FEED_POST_KINDS = ["official", "event", "fan", "star", "growth", "profile_update", "talk_diary"] as const;
export type StarFeedPostKind = (typeof STAR_FEED_POST_KINDS)[number];

export const STAR_FEED_VISIBILITIES = ["PRIVATE", "FRIENDS", "PUBLIC"] as const;
export type StarFeedVisibility = (typeof STAR_FEED_VISIBILITIES)[number];
export const STAR_FEED_POST_STATUSES = ["DRAFT", "PUBLISHED", "HIDDEN", "REMOVED"] as const;
export type StarFeedPostStatus = (typeof STAR_FEED_POST_STATUSES)[number];

export const starFeedPostsTable = pgTable(
  "star_feed_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorUserId: uuid("author_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    authorProfileId: uuid("author_profile_id").references(() => characterProfilesTable.id, { onDelete: "set null" }),
    authorStarProfileId: uuid("author_star_profile_id").references(() => starProfilesTable.id, { onDelete: "set null" }),
    targetStarProfileId: uuid("target_star_profile_id").references(() => starProfilesTable.id, { onDelete: "set null" }),
    kind: text("kind").$type<StarFeedPostKind>().notNull().default("fan"),
    sourceKey: text("source_key").unique(),
    repostOfPostId: uuid("repost_of_post_id"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
    media: jsonb("media").$type<Array<{ objectPath: string; mediaType: "image" | "video"; altText?: string }>>(),
    status: text("status").$type<StarFeedPostStatus>().notNull().default("PUBLISHED"),
    visibility: text("visibility").$type<StarFeedVisibility>().notNull().default("PUBLIC"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("star_feed_posts_created_at_idx").on(t.createdAt),
    index("star_feed_posts_kind_created_at_idx").on(t.kind, t.createdAt),
    index("star_feed_posts_author_user_id_idx").on(t.authorUserId),
    index("star_feed_posts_author_profile_id_idx").on(t.authorProfileId),
    index("star_feed_posts_author_star_profile_id_idx").on(t.authorStarProfileId),
    index("star_feed_posts_target_star_profile_id_idx").on(t.targetStarProfileId),
    index("star_feed_posts_status_created_at_idx").on(t.status, t.createdAt),
    index("star_feed_posts_repost_of_post_id_idx").on(t.repostOfPostId),
  ],
);

export const starFeedReportsTable = pgTable(
  "star_feed_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").notNull().references(() => starFeedPostsTable.id, { onDelete: "cascade" }),
    reporterUserId: uuid("reporter_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    details: text("details"),
    status: text("status").notNull().default("OPEN"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("star_feed_reports_post_reporter_idx").on(t.postId, t.reporterUserId),
    index("star_feed_reports_status_created_at_idx").on(t.status, t.createdAt),
  ],
);

export const starResultDraftsTable = pgTable(
  "star_result_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    starProfileId: uuid("star_profile_id").references(() => starProfilesTable.id, { onDelete: "set null" }),
    sourceType: text("source_type").notNull(),
    sourceKey: text("source_key").notNull().unique(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("DRAFT"),
    publishedPostId: uuid("published_post_id").references(() => starFeedPostsTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("star_result_drafts_user_status_created_at_idx").on(t.userId, t.status, t.createdAt),
  ],
);

export const fanCommunitiesTable = pgTable("fan_communities", {
  id: uuid("id").primaryKey().defaultRandom(),
  starProfileId: uuid("star_profile_id").notNull().references(() => starProfilesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("fan_communities_star_profile_idx").on(t.starProfileId)]);

export const fanCommunityMembersTable = pgTable("fan_community_members", {
  communityId: uuid("community_id").notNull().references(() => fanCommunitiesTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("MEMBER"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("fan_community_members_unique_idx").on(t.communityId, t.userId), index("fan_community_members_user_idx").on(t.userId)]);

export const fanBroadcastsTable = pgTable("fan_broadcasts", {
  id: uuid("id").primaryKey().defaultRandom(),
  communityId: uuid("community_id").notNull().references(() => fanCommunitiesTable.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(), body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("fan_broadcasts_community_created_at_idx").on(t.communityId, t.createdAt)]);

export const fanMissionsTable = pgTable("fan_missions", {
  id: uuid("id").primaryKey().defaultRandom(),
  communityId: uuid("community_id").notNull().references(() => fanCommunitiesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(), description: text("description").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("fan_missions_community_status_idx").on(t.communityId, t.status)]);

export const fanMissionParticipantsTable = pgTable("fan_mission_participants", {
  missionId: uuid("mission_id").notNull().references(() => fanMissionsTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("JOINED"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("fan_mission_participants_unique_idx").on(t.missionId, t.userId)]);

export const starProfileFollowsTable = pgTable(
  "star_profile_follows",
  {
    followerUserId: uuid("follower_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    starProfileId: uuid("star_profile_id").notNull().references(() => starProfilesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("star_profile_follows_follower_profile_idx").on(t.followerUserId, t.starProfileId),
    index("star_profile_follows_profile_created_at_idx").on(t.starProfileId, t.createdAt),
    index("star_profile_follows_follower_created_at_idx").on(t.followerUserId, t.createdAt),
  ],
);

export const starFeedActivitiesTable = pgTable(
  "star_feed_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    starProfileId: uuid("star_profile_id").references(() => starProfilesTable.id, { onDelete: "set null" }),
    postId: uuid("post_id").references(() => starFeedPostsTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("star_feed_activities_user_created_at_idx").on(t.userId, t.createdAt),
  ],
);

export const starFeedReactionsTable = pgTable(
  "star_feed_reactions",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => starFeedPostsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").notNull().references(() => characterProfilesTable.id, { onDelete: "cascade" }),
    reactionType: text("reaction_type").notNull().default("cheer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("star_feed_reactions_post_profile_idx").on(t.postId, t.profileId),
    index("star_feed_reactions_post_id_idx").on(t.postId),
    index("star_feed_reactions_user_id_idx").on(t.userId),
  ],
);

export const starFeedCommentsTable = pgTable(
  "star_feed_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => starFeedPostsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").references(() => characterProfilesTable.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("star_feed_comments_post_id_created_at_idx").on(t.postId, t.createdAt),
    index("star_feed_comments_user_id_idx").on(t.userId),
  ],
);

export type StarFeedPost = typeof starFeedPostsTable.$inferSelect;
export type StarFeedReaction = typeof starFeedReactionsTable.$inferSelect;
export type StarFeedComment = typeof starFeedCommentsTable.$inferSelect;
export type StarProfileFollow = typeof starProfileFollowsTable.$inferSelect;
export type StarFeedActivity = typeof starFeedActivitiesTable.$inferSelect;
export type StarFeedReport = typeof starFeedReportsTable.$inferSelect;
export type StarResultDraft = typeof starResultDraftsTable.$inferSelect;
export type FanCommunity = typeof fanCommunitiesTable.$inferSelect;
export type FanCommunityMember = typeof fanCommunityMembersTable.$inferSelect;
export type FanBroadcast = typeof fanBroadcastsTable.$inferSelect;
export type FanMission = typeof fanMissionsTable.$inferSelect;
