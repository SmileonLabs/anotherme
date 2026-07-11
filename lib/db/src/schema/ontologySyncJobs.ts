import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ONTOLOGY_SYNC_JOB_STATUSES = ["pending", "processing", "processed", "failed"] as const;
export type OntologySyncJobStatus = (typeof ONTOLOGY_SYNC_JOB_STATUSES)[number];

export const ontologySyncJobsTable = pgTable(
  "ontology_sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceKey: text("source_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<OntologySyncJobStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("ontology_sync_jobs_source_key_idx").on(t.sourceKey),
    index("ontology_sync_jobs_status_available_idx").on(t.status, t.availableAt),
    index("ontology_sync_jobs_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export type OntologySyncJob = typeof ontologySyncJobsTable.$inferSelect;
