import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const searchQueryLogsTable = pgTable(
  "search_query_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    normalizedTerm: text("normalized_term").notNull(),
    termHash: text("term_hash").notNull(),
    userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    resultCount: integer("result_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("search_query_logs_term_created_at_idx").on(t.normalizedTerm, t.createdAt),
    index("search_query_logs_created_at_idx").on(t.createdAt),
  ],
);

export const searchTrendingBlocksTable = pgTable(
  "search_trending_blocks",
  {
    normalizedTerm: text("normalized_term").primaryKey(),
    reason: text("reason").notNull().default("manual"),
    createdBy: uuid("created_by").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);
