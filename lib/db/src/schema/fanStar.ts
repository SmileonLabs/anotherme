import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export type PlayMode = "fan" | "star";
export type StarProfileStage = "aspiring" | "promoted";

export interface FanStats {
  fanPower: number;
  supportPower: number;
  empathy: number;
  story: number;
}

export const DEFAULT_FAN_STATS: FanStats = {
  fanPower: 0,
  supportPower: 0,
  empathy: 0,
  story: 0,
};

export interface StarStats {
  charm: number;
  stagePresence: number;
  bond: number;
  lore: number;
}

export const DEFAULT_STAR_STATS: StarStats = {
  charm: 0,
  stagePresence: 0,
  bond: 0,
  lore: 0,
};

export const fanProfilesTable = pgTable("fan_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  stats: jsonb("stats").$type<FanStats>().notNull().default(DEFAULT_FAN_STATS),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const userPlayModesTable = pgTable("user_play_modes", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  currentMode: text("current_mode").notNull().default("fan").$type<PlayMode>(),
  starUnlocked: boolean("star_unlocked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const starProfilesTable = pgTable(
  "star_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    walletAddress: text("wallet_address").notNull(),
    chainId: integer("chain_id").notNull(),
    contractAddress: text("contract_address").notNull(),
    tokenId: text("token_id").notNull(),
    collectionId: uuid("collection_id"),
    starKey: text("star_key").notNull(),
    displayName: text("display_name").notNull(),
    imageUrl: text("image_url"),
    category: text("category").notNull().default("idol"),
    ownershipStatus: text("ownership_status").notNull().default("verified"),
    currentEvolutionStage: text("current_evolution_stage").notNull().default("base"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    stage: text("stage").notNull().default("aspiring").$type<StarProfileStage>(),
    level: integer("level").notNull().default(1),
    xp: integer("xp").notNull().default(0),
    stats: jsonb("stats").$type<StarStats>().notNull().default(DEFAULT_STAR_STATS),
    equippedAt: timestamp("equipped_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    torimiaOpenedAt: timestamp("torimia_opened_at", { withTimezone: true }),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("star_profiles_active_nft_idx")
      .on(t.chainId, t.contractAddress, t.tokenId)
      .where(sql`${t.ownershipStatus} = 'verified'`),
    index("star_profiles_user_id_equipped_idx").on(t.userId, t.equippedAt),
  ],
);

export const starGrowthEventsTable = pgTable(
  "star_growth_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    starProfileId: uuid("star_profile_id")
      .notNull()
      .references(() => starProfilesTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull().unique(),
    eventType: text("event_type").notNull(),
    xpDelta: integer("xp_delta").notNull().default(0),
    statChanges: jsonb("stat_changes").$type<Partial<StarStats>>(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    beforeLevel: integer("before_level").notNull().default(1),
    afterLevel: integer("after_level").notNull().default(1),
    beforeXp: integer("before_xp").notNull().default(0),
    afterXp: integer("after_xp").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("star_growth_events_star_created_at_idx").on(t.starProfileId, t.createdAt),
    index("star_growth_events_user_created_at_idx").on(t.userId, t.createdAt),
  ],
);

export type FanProfile = typeof fanProfilesTable.$inferSelect;
export type UserPlayMode = typeof userPlayModesTable.$inferSelect;
export type StarProfile = typeof starProfilesTable.$inferSelect;
export type StarGrowthEvent = typeof starGrowthEventsTable.$inferSelect;
