import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { fanProfilesTable, starProfilesTable } from "./fanStar";
import { officialAiAccountsTable } from "./officialAi";
import { usersTable } from "./users";

export const CHARACTER_PROFILE_TYPES = ["fan", "star", "official_ai"] as const;
export type CharacterProfileType = (typeof CHARACTER_PROFILE_TYPES)[number];

export const CHARACTER_PROFILE_STATUSES = ["active", "locked", "torimia", "archived"] as const;
export type CharacterProfileStatus = (typeof CHARACTER_PROFILE_STATUSES)[number];

/**
 * Public activity identity. Authentication, billing and sanctions remain tied
 * to users; public posts, follows, chat presentation and growth select one of
 * these profiles owned by that user.
 */
export const characterProfilesTable = pgTable(
  "character_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").$type<CharacterProfileType>().notNull(),
    handle: text("handle").notNull(),
    displayName: text("display_name").notNull(),
    profileImageUrl: text("profile_image_url"),
    statusMessage: text("status_message"),
    status: text("status").$type<CharacterProfileStatus>().notNull().default("active"),
    level: integer("level").notNull().default(1),
    xp: integer("xp").notNull().default(0),
    stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("character_profiles_handle_idx").on(table.handle),
    index("character_profiles_owner_type_idx").on(table.ownerUserId, table.type, table.createdAt),
    index("character_profiles_status_idx").on(table.status, table.updatedAt),
  ],
);

export const fanCharacterProfilesTable = pgTable(
  "fan_character_profiles",
  {
    profileId: uuid("profile_id")
      .primaryKey()
      .references(() => characterProfilesTable.id, { onDelete: "cascade" }),
    legacyFanUserId: uuid("legacy_fan_user_id")
      .notNull()
      .references(() => fanProfilesTable.userId, { onDelete: "cascade" }),
    customization: jsonb("customization").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [uniqueIndex("fan_character_profiles_legacy_idx").on(table.legacyFanUserId)],
);

export const starCharacterProfilesTable = pgTable(
  "star_character_profiles",
  {
    profileId: uuid("profile_id")
      .primaryKey()
      .references(() => characterProfilesTable.id, { onDelete: "cascade" }),
    starProfileId: uuid("star_profile_id")
      .notNull()
      .references(() => starProfilesTable.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("star_character_profiles_star_idx").on(table.starProfileId)],
);

export const officialAiCharacterProfilesTable = pgTable(
  "official_ai_character_profiles",
  {
    profileId: uuid("profile_id")
      .primaryKey()
      .references(() => characterProfilesTable.id, { onDelete: "cascade" }),
    officialAiAccountId: uuid("official_ai_account_id")
      .notNull()
      .references(() => officialAiAccountsTable.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("official_ai_character_profiles_account_idx").on(table.officialAiAccountId)],
);

export const activeCharacterProfilesTable = pgTable("active_character_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  activeProfileId: uuid("active_profile_id")
    .notNull()
    .references(() => characterProfilesTable.id, { onDelete: "cascade" }),
  lastFanProfileId: uuid("last_fan_profile_id").references(() => characterProfilesTable.id, {
    onDelete: "set null",
  }),
  lastStarProfileId: uuid("last_star_profile_id").references(() => characterProfilesTable.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const characterProfileFollowsTable = pgTable(
  "character_profile_follows",
  {
    followerProfileId: uuid("follower_profile_id")
      .notNull()
      .references(() => characterProfilesTable.id, { onDelete: "cascade" }),
    followedProfileId: uuid("followed_profile_id")
      .notNull()
      .references(() => characterProfilesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerProfileId, table.followedProfileId] }),
    index("character_profile_follows_followed_idx").on(table.followedProfileId, table.createdAt),
  ],
);

export const characterGrowthEventsTable = pgTable(
  "character_growth_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => characterProfilesTable.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    eventType: text("event_type").notNull(),
    xpDelta: integer("xp_delta").notNull().default(0),
    statChanges: jsonb("stat_changes").$type<Record<string, number>>().notNull().default({}),
    beforeLevel: integer("before_level").notNull(),
    afterLevel: integer("after_level").notNull(),
    beforeXp: integer("before_xp").notNull(),
    afterXp: integer("after_xp").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("character_growth_events_source_idx").on(table.sourceKey),
    index("character_growth_events_profile_created_idx").on(table.profileId, table.createdAt),
  ],
);

export type CharacterProfile = typeof characterProfilesTable.$inferSelect;
export type ActiveCharacterProfile = typeof activeCharacterProfilesTable.$inferSelect;
