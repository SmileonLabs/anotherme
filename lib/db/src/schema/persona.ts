import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * The seven growth attributes of a user's "Another Me" persona. Each is a
 * non-negative cumulative counter raised by deterministic activity (chat,
 * talk-battle, dungeon). AI analysis (a later phase) only touches the
 * qualitative `summary`, never these numbers.
 */
export interface PersonaStats {
  /** 논리 — reasoning, structured argument (talk battle). */
  logic: number;
  /** 공감 — empathy, social warmth (chat). */
  empathy: number;
  /** 위트 — humor, quick comebacks (talk battle). */
  wit: number;
  /** 지식 — knowledge, lore mastery (dungeon goals). */
  knowledge: number;
  /** 신념 — conviction, holding a stance (battle wins). */
  conviction: number;
  /** 감정 — emotional resilience (battle losses). */
  emotion: number;
  /** 결단 — decisiveness, taking action (dungeon turns). */
  decisiveness: number;
}

export const DEFAULT_PERSONA_STATS: PersonaStats = {
  logic: 0,
  empathy: 0,
  wit: 0,
  knowledge: 0,
  conviction: 0,
  emotion: 0,
  decisiveness: 0,
};

/**
 * One "Another Me" persona per user (1:1). Created lazily on first access (like
 * users are auto-provisioned). `level`/`xp`/`stats` are driven by deterministic
 * growth; `summary`/`lastAnalyzedAt` are reserved for the later AI-analysis
 * phase and stay null until then.
 */
export const personasTable = pgTable("personas", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  stats: jsonb("stats").$type<PersonaStats>().notNull().default(DEFAULT_PERSONA_STATS),
  summary: text("summary"),
  lastAnalyzedAt: timestamp("last_analyzed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertPersonaSchema = createInsertSchema(personasTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPersona = z.infer<typeof insertPersonaSchema>;
export type Persona = typeof personasTable.$inferSelect;
