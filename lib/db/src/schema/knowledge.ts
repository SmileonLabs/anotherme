import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { chatRoomsTable } from "./chat";
import { usersTable } from "./users";

export const KNOWLEDGE_STATUSES = ["draft", "approved", "rejected", "archived", "inferred"] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export const PRIVACY_SCOPES = ["official_public", "public_profile", "user_private", "relationship_private", "system_internal"] as const;
export type PrivacyScope = (typeof PRIVACY_SCOPES)[number];

export const knowledgeSourcesTable = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    sourceType: text("source_type").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    body: text("body"),
    status: text("status").$type<KnowledgeStatus>().notNull().default("draft"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: uuid("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    collectedAt: timestamp("collected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("knowledge_sources_tenant_status_idx").on(t.tenantId, t.status),
    index("knowledge_sources_created_by_idx").on(t.createdByUserId),
  ],
);

export const knowledgeDocumentsTable = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id").notNull().references(() => knowledgeSourcesTable.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    checksum: text("checksum"),
    status: text("status").$type<KnowledgeStatus>().notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("knowledge_documents_source_idx").on(t.sourceId)],
);

export const knowledgeExtractionJobsTable = pgTable(
  "knowledge_extraction_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    sourceId: uuid("source_id").references(() => knowledgeSourcesTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    error: text("error"),
    statsJson: jsonb("stats_json").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: uuid("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("knowledge_extraction_jobs_tenant_status_idx").on(t.tenantId, t.status)],
);

export const knowledgeReviewItemsTable = pgTable(
  "knowledge_review_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    sourceId: uuid("source_id").references(() => knowledgeSourcesTable.id, { onDelete: "set null" }),
    jobId: uuid("job_id").references(() => knowledgeExtractionJobsTable.id, { onDelete: "set null" }),
    itemType: text("item_type").notNull(),
    graphId: text("graph_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status").$type<KnowledgeStatus>().notNull().default("draft"),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: uuid("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("knowledge_review_items_tenant_status_idx").on(t.tenantId, t.status),
    index("knowledge_review_items_source_idx").on(t.sourceId),
    index("knowledge_review_items_item_type_status_idx").on(t.itemType, t.status),
  ],
);

export const knowledgeReviewEventsTable = pgTable(
  "knowledge_review_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewItemId: uuid("review_item_id").references(() => knowledgeReviewItemsTable.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("knowledge_review_events_item_idx").on(t.reviewItemId)],
);

export const userAiMemoriesTable = pgTable(
  "user_ai_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    subjectUserId: uuid("subject_user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    memoryType: text("memory_type").notNull().default("preference"),
    text: text("text").notNull(),
    privacyScope: text("privacy_scope").$type<PrivacyScope>().notNull().default("user_private"),
    status: text("status").$type<KnowledgeStatus>().notNull().default("approved"),
    confidence: integer("confidence").notNull().default(100),
    source: text("source").notNull().default("manual"),
    graphMemoryId: text("graph_memory_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("user_ai_memories_user_status_idx").on(t.userId, t.status)],
);

export const aiCampaignsTable = pgTable(
  "ai_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: text("tenant_id").notNull(),
    ownerUserId: uuid("owner_user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"),
    triggerType: text("trigger_type").notNull().default("manual"),
    conditionJson: jsonb("condition_json").$type<Record<string, unknown>>().notNull().default({}),
    messageTemplate: text("message_template").notNull(),
    cooldownHours: integer("cooldown_hours").notNull().default(24),
    maxPerUser: integer("max_per_user").notNull().default(1),
    createdByUserId: uuid("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("ai_campaigns_tenant_status_idx").on(t.tenantId, t.status)],
);

export const aiCampaignDeliveriesTable = pgTable(
  "ai_campaign_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").notNull().references(() => aiCampaignsTable.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").references(() => chatRoomsTable.id, { onDelete: "set null" }),
    status: text("status").notNull().default("queued"),
    error: text("error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_campaign_deliveries_campaign_target_idx").on(t.campaignId, t.targetUserId)],
);

export type KnowledgeSource = typeof knowledgeSourcesTable.$inferSelect;
export type KnowledgeReviewItem = typeof knowledgeReviewItemsTable.$inferSelect;
export type UserAiMemory = typeof userAiMemoriesTable.$inferSelect;
export type AiCampaign = typeof aiCampaignsTable.$inferSelect;
