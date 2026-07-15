import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const NFT_COLLECTION_STATUSES = ["draft", "analyzing", "review_required", "approved", "published", "rejected", "suspended"] as const;
export type NftCollectionStatus = (typeof NFT_COLLECTION_STATUSES)[number];

export const nftCollectionsTable = pgTable("nft_collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  chainId: integer("chain_id").notNull(),
  contractAddress: text("contract_address").notNull(),
  rpcUrl: text("rpc_url"),
  name: text("name").notNull(),
  ipName: text("ip_name").notNull(),
  category: text("category").notNull().default("character"),
  officialUrl: text("official_url"),
  metadataUrl: text("metadata_url"),
  rightsStatus: text("rights_status").notNull().default("review_required"),
  status: text("status").$type<NftCollectionStatus>().notNull().default("draft"),
  worldStyle: text("world_style"),
  roleName: text("role_name"),
  rpgBlueprint: jsonb("rpg_blueprint").$type<Record<string, unknown>>(),
  aiAnalysis: jsonb("ai_analysis").$type<Record<string, unknown>>(),
  aiAnalyzedAt: timestamp("ai_analyzed_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("nft_collections_chain_contract_idx").on(t.chainId, t.contractAddress),
]);

export const nftEvolutionStagesTable = pgTable("nft_evolution_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  collectionId: uuid("collection_id").notNull().references(() => nftCollectionsTable.id, { onDelete: "cascade" }),
  stageKey: text("stage_key").notNull(),
  minLevel: integer("min_level").notNull().default(1),
  maxLevel: integer("max_level"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url"),
  retainedTraits: jsonb("retained_traits").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("nft_evolution_collection_stage_idx").on(t.collectionId, t.stageKey)]);

export type NftCollection = typeof nftCollectionsTable.$inferSelect;
export type NftEvolutionStage = typeof nftEvolutionStagesTable.$inferSelect;
