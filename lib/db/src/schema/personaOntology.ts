import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export type PersonaProfileStatus = "draft" | "inferred" | "approved" | "archived";

export interface PersonaProfileSourceCounts {
  memory?: number;
  chat?: number;
  battle?: number;
  analysis?: number;
}

/**
 * Fast Postgres snapshot of the ontology-based persona graph. Neo4j remains the
 * semantic source; this table keeps mobile screens and prompts cheap and fallback-safe.
 */
export const personaProfilesTable = pgTable(
  "persona_profiles",
  {
    userId: uuid("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
    archetypeKey: text("archetype_key").notNull().default("forming"),
    archetypeLabel: text("archetype_label").notNull().default("형성 중인 자아"),
    summary: text("summary"),
    traitTags: jsonb("trait_tags").$type<string[]>().notNull().default([]),
    communicationStyles: jsonb("communication_styles").$type<string[]>().notNull().default([]),
    preferences: jsonb("preferences").$type<string[]>().notNull().default([]),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    conflictStyles: jsonb("conflict_styles").$type<string[]>().notNull().default([]),
    evidenceSummary: jsonb("evidence_summary").$type<string[]>().notNull().default([]),
    sourceCounts: jsonb("source_counts").$type<PersonaProfileSourceCounts>().notNull().default({}),
    sourceKeys: jsonb("source_keys").$type<string[]>().notNull().default([]),
    confidence: integer("confidence").notNull().default(0),
    status: text("status").$type<PersonaProfileStatus>().notNull().default("inferred"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("persona_profiles_status_idx").on(t.status, t.updatedAt)],
);

export type PersonaProfile = typeof personaProfilesTable.$inferSelect;
