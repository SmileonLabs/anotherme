import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clansTable } from "./clan";
import { usersTable } from "./users";

/**
 * Clan Memory ("가문 기억") — a piece of knowledge, strategy, lesson, value,
 * achievement, or warning that members deliberately preserve for the clan. This
 * is NOT an automatic log: nothing is written here without an explicit user
 * action. It must NEVER store raw chat / battle utterances / dungeon transcripts
 * / personal AI analysis — only a user-authored `summary` plus an optional
 * reference (`sourceId`) back to the originating battle/dungeon. No XP, AI, or
 * ranking logic reads or writes this table; it is fully self-contained.
 */
export const clanMemoriesTable = pgTable(
  "clan_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clanId: uuid("clan_id")
      .notNull()
      .references(() => clansTable.id, { onDelete: "cascade" }),
    /** battle | dungeon | manual | system */
    sourceType: text("source_type").notNull().default("manual"),
    /** Free reference to the originating entity (battle/dungeon id). No PII. */
    sourceId: text("source_id"),
    /**
     * Optional natural key for idempotent saves (e.g. `battle:<id>` so the same
     * battle win can't be saved twice). Unique when present, null otherwise.
     */
    sourceKey: text("source_key").unique(),
    /** strategy | lesson | value | achievement | warning */
    memoryType: text("memory_type").notNull().default("strategy"),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    importanceScore: integer("importance_score").notNull().default(0),
    /** User-supplied tags, stored as a JSON string array. */
    tags: text("tags").array().notNull().default([]),
    createdByUserId: uuid("created_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("clan_memories_clan_id_created_at_idx").on(t.clanId, t.createdAt),
    index("clan_memories_clan_id_importance_idx").on(t.clanId, t.importanceScore),
    index("clan_memories_clan_id_memory_type_idx").on(t.clanId, t.memoryType),
  ],
);

export const CLAN_MEMORY_TYPES = [
  "strategy",
  "lesson",
  "value",
  "achievement",
  "warning",
] as const;
export type ClanMemoryType = (typeof CLAN_MEMORY_TYPES)[number];

export const CLAN_MEMORY_SOURCE_TYPES = [
  "battle",
  "dungeon",
  "manual",
  "system",
] as const;
export type ClanMemorySourceType = (typeof CLAN_MEMORY_SOURCE_TYPES)[number];

export const insertClanMemorySchema = createInsertSchema(clanMemoriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClanMemory = z.infer<typeof insertClanMemorySchema>;
export type ClanMemory = typeof clanMemoriesTable.$inferSelect;
