import {
  boolean,
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
    jobKey: text("job_key"),
    jobStage: integer("job_stage").notNull().default(0),
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
      .references(() => fanProfilesTable.userId, { onDelete: "cascade" }),
    generation: integer("generation").notNull().default(1),
    customization: jsonb("customization").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [index("fan_character_profiles_legacy_idx").on(table.legacyFanUserId)],
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

export const characterProfileQuestProgressTable = pgTable(
  "character_profile_quest_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id").notNull().references(() => characterProfilesTable.id, { onDelete: "cascade" }),
    questKey: text("quest_key").notNull(),
    questType: text("quest_type").notNull(),
    periodKey: text("period_key").notNull(),
    progress: integer("progress").notNull().default(0),
    target: integer("target").notNull().default(1),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    rewardClaimedAt: timestamp("reward_claimed_at", { withTimezone: true }),
    rewardXp: integer("reward_xp").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("character_profile_quest_period_idx").on(table.profileId, table.questKey, table.periodKey),
    index("character_profile_quest_type_idx").on(table.profileId, table.questType),
  ],
);

export const characterProfileAchievementsTable = pgTable(
  "character_profile_achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id").notNull().references(() => characterProfilesTable.id, { onDelete: "cascade" }),
    achievementKey: text("achievement_key").notNull(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
    rewardClaimedAt: timestamp("reward_claimed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [uniqueIndex("character_profile_achievement_idx").on(table.profileId, table.achievementKey)],
);

export const characterProfileInventoryTable = pgTable(
  "character_profile_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id").notNull().references(() => characterProfilesTable.id, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    itemType: text("item_type").notNull().default("material"),
    quantity: integer("quantity").notNull().default(0),
    equipped: boolean("equipped").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("character_profile_inventory_item_idx").on(table.profileId, table.itemKey),
    index("character_profile_inventory_profile_idx").on(table.profileId, table.updatedAt),
  ],
);

/**
 * Versioned catalog of character artwork. The client never infers behavior
 * from a filename; slot, gender, progression and price rules live here.
 */
export const avatarCatalogItemsTable = pgTable(
  "avatar_catalog_items",
  {
    itemKey: text("item_key").primaryKey(),
    avatarType: text("avatar_type").$type<"fan" | "star">().notNull(),
    collectionKey: text("collection_key"),
    gender: text("gender").$type<"man" | "woman" | null>(),
    slot: text("slot").$type<"background" | "base" | "head" | "wear" | "effect" | "full_skin" | "star_form">().notNull(),
    classStage: integer("class_stage").notNull().default(0),
    jobKey: text("job_key"),
    displayName: text("display_name").notNull(),
    assetPath: text("asset_path").notNull(),
    layerOrder: integer("layer_order").notNull().default(0),
    priceStarPoint: integer("price_star_point").notNull().default(0),
    purchasable: boolean("purchasable").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    status: text("status").notNull().default("published"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("avatar_catalog_type_slot_idx").on(table.avatarType, table.slot, table.status),
    index("avatar_catalog_collection_stage_idx").on(table.collectionKey, table.classStage),
  ],
);

/** One authoritative, slot-safe appearance per character profile. */
export const characterAvatarLoadoutsTable = pgTable(
  "character_avatar_loadouts",
  {
    profileId: uuid("profile_id").primaryKey().references(() => characterProfilesTable.id, { onDelete: "cascade" }),
    backgroundKey: text("background_key"),
    baseKey: text("base_key"),
    headKey: text("head_key"),
    wearKey: text("wear_key"),
    effectKey: text("effect_key"),
    fullSkinKey: text("full_skin_key"),
    starFormKey: text("star_form_key"),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [index("character_avatar_loadouts_updated_idx").on(table.updatedAt)],
);

export const characterProfileNotificationsTable = pgTable(
  "character_profile_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id").notNull().references(() => characterProfilesTable.id, { onDelete: "cascade" }),
    actorProfileId: uuid("actor_profile_id").references(() => characterProfilesTable.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("character_profile_notifications_profile_idx").on(table.profileId, table.readAt, table.createdAt)],
);

export type CharacterProfile = typeof characterProfilesTable.$inferSelect;
export type ActiveCharacterProfile = typeof activeCharacterProfilesTable.$inferSelect;
export type AvatarCatalogItem = typeof avatarCatalogItemsTable.$inferSelect;
export type CharacterAvatarLoadout = typeof characterAvatarLoadoutsTable.$inferSelect;
