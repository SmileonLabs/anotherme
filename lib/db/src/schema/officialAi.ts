import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const OFFICIAL_AI_ACCOUNT_STATUSES = ["draft", "review_required", "approved", "published", "suspended", "archived"] as const;
export type OfficialAiAccountStatus = (typeof OFFICIAL_AI_ACCOUNT_STATUSES)[number];

/** First-class account record for BIBI and every future official AI service. */
export const officialAiAccountsTable = pgTable(
  "official_ai_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    displayName: text("display_name").notNull(),
    accountKind: text("account_kind").notNull().default("ip_character"),
    status: text("status").$type<OfficialAiAccountStatus>().notNull().default("draft"),
    description: text("description"),
    profileImageUrl: text("profile_image_url"),
    officialUserId: uuid("official_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    ipProfileId: text("ip_profile_id"),
    knowledgeTenantId: text("knowledge_tenant_id"),
    personaJson: jsonb("persona_json").$type<Record<string, unknown>>().notNull().default({}),
    channelConfigJson: jsonb("channel_config_json").$type<Record<string, unknown>>().notNull().default({}),
    safetyPolicyJson: jsonb("safety_policy_json").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: uuid("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    approvedByUserId: uuid("approved_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("official_ai_accounts_status_idx").on(t.status, t.updatedAt), index("official_ai_accounts_ip_idx").on(t.ipProfileId), index("official_ai_accounts_user_idx").on(t.officialUserId)],
);

export type OfficialAiAccount = typeof officialAiAccountsTable.$inferSelect;
