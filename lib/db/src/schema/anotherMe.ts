import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { chatRoomsTable } from "./chat";
import { usersTable } from "./users";

export type AnotherMeRelationshipType = "FRIEND" | "FAMILY" | "WORK" | "PARTNER" | "UNKNOWN" | "CUSTOM";
export type AnotherMeToneSyncLevel = "LOW" | "MEDIUM" | "HIGH";
export type AnotherMeSessionStatus = "ACTIVE" | "DISMISSED_BY_OWNER" | "DISMISSED_BY_CALLER" | "EXPIRED" | "FAILED";
export type AnotherMeHonorificStyle = "BANMAL" | "JONDAETMAL" | "MIXED";

export const anotherMeSettingsTable = pgTable(
  "another_me_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    summonEnabled: boolean("summon_enabled").notNull().default(false),
    defaultWaitMinutes: integer("default_wait_minutes").notNull().default(5),
    allowFriends: boolean("allow_friends").notNull().default(true),
    allowFamily: boolean("allow_family").notNull().default(true),
    allowWork: boolean("allow_work").notNull().default(false),
    allowUnknown: boolean("allow_unknown").notNull().default(false),
    autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(true),
    sensitiveReplyBlocked: boolean("sensitive_reply_blocked").notNull().default(true),
    toneSyncEnabled: boolean("tone_sync_enabled").notNull().default(true),
    defaultToneSyncLevel: text("default_tone_sync_level").$type<AnotherMeToneSyncLevel>().notNull().default("MEDIUM"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("another_me_settings_user_id_idx").on(t.userId)],
);

export const anotherMeRoomSettingsTable = pgTable(
  "another_me_room_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").notNull().references(() => chatRoomsTable.id, { onDelete: "cascade" }),
    summonEnabled: boolean("summon_enabled"),
    waitMinutes: integer("wait_minutes"),
    toneSyncLevel: text("tone_sync_level").$type<AnotherMeToneSyncLevel>(),
    relationshipType: text("relationship_type").$type<AnotherMeRelationshipType>().notNull().default("UNKNOWN"),
    autoReplyLevel: text("auto_reply_level").notNull().default("standard"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("another_me_room_settings_user_room_idx").on(t.userId, t.roomId),
    index("another_me_room_settings_room_idx").on(t.roomId),
  ],
);

export const anotherMeSessionsTable = pgTable(
  "another_me_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    summonedByUserId: uuid("summoned_by_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").notNull().references(() => chatRoomsTable.id, { onDelete: "cascade" }),
    status: text("status").$type<AnotherMeSessionStatus>().notNull().default("ACTIVE"),
    summonedAt: timestamp("summoned_at", { withTimezone: true }).notNull().defaultNow(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    dismissedByUserId: uuid("dismissed_by_user_id").references(() => usersTable.id),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("another_me_sessions_room_status_idx").on(t.roomId, t.status),
    index("another_me_sessions_owner_status_idx").on(t.ownerUserId, t.status),
    uniqueIndex("another_me_sessions_active_owner_room_idx")
      .on(t.ownerUserId, t.roomId)
      .where(sql`${t.status} = 'ACTIVE'`),
  ],
);

export const anotherMeToneProfilesTable = pgTable(
  "another_me_tone_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type").$type<AnotherMeRelationshipType>().notNull(),
    toneSummary: text("tone_summary"),
    honorificStyle: text("honorific_style").$type<AnotherMeHonorificStyle>().notNull().default("MIXED"),
    averageMessageLength: integer("average_message_length").notNull().default(0),
    emojiUsageLevel: integer("emoji_usage_level").notNull().default(0),
    laughterUsageLevel: integer("laughter_usage_level").notNull().default(0),
    formalityLevel: integer("formality_level").notNull().default(50),
    warmthLevel: integer("warmth_level").notNull().default(50),
    humorLevel: integer("humor_level").notNull().default(50),
    commonPhrasesJson: jsonb("common_phrases_json").$type<string[]>().notNull().default([]),
    forbiddenPhrasesJson: jsonb("forbidden_phrases_json").$type<string[]>().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("another_me_tone_profiles_user_relationship_idx").on(t.userId, t.relationshipType)],
);

export type AnotherMeSettings = typeof anotherMeSettingsTable.$inferSelect;
export type AnotherMeRoomSettings = typeof anotherMeRoomSettingsTable.$inferSelect;
export type AnotherMeSession = typeof anotherMeSessionsTable.$inferSelect;
export type AnotherMeToneProfile = typeof anotherMeToneProfilesTable.$inferSelect;
