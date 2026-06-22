import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { clansTable } from "./clan";
import { usersTable } from "./users";

/**
 * Clan Wisdom ("가문의 지혜") — an AI-summarized portrait of a clan's collective
 * identity: its philosophy, strategy, values, culture, and motto. It is derived
 * READ-ONLY from existing Clan Memories + Clan Identity. It is NEVER generated in
 * real time: a single row per clan is (re)created only when an owner/elder
 * explicitly taps "가문 지혜 갱신". This table holds only AI-produced summary text;
 * it never stores raw chat / battle / dungeon transcripts or per-member PII, and
 * it never reads or writes XP, persona, clan-EXP, or ranking data.
 */
export const clanWisdomTable = pgTable("clan_wisdom", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** One wisdom row per clan (regenerating overwrites it). */
  clanId: uuid("clan_id")
    .notNull()
    .unique()
    .references(() => clansTable.id, { onDelete: "cascade" }),
  philosophy: text("philosophy").notNull(),
  strategy: text("strategy").notNull(),
  values: text("values").notNull(),
  culture: text("culture").notNull(),
  motto: text("motto").notNull(),
  /** How many clan memories informed this generation (display/context only). */
  sourceMemoryCount: integer("source_memory_count").notNull().default(0),
  generatedByUserId: uuid("generated_by_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const clanWisdomFieldsSchema = z.object({
  philosophy: z.string(),
  strategy: z.string(),
  values: z.string(),
  culture: z.string(),
  motto: z.string(),
});
export type ClanWisdomFields = z.infer<typeof clanWisdomFieldsSchema>;
export type ClanWisdom = typeof clanWisdomTable.$inferSelect;
