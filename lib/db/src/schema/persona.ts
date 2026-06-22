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
 * Structured metadata attached to the most recent AI analysis. Kept in a single
 * jsonb column so we can evolve it without migrations. Never stores sensitive
 * conclusions — only bookkeeping about how the analysis was produced.
 */
export interface PersonaAnalysisMetadata {
  /** Model's self-reported confidence 0..1 for the latest analysis. */
  confidence?: number;
  /** How many items of each source fed the latest analysis. */
  dataCounts?: {
    chat?: number;
    battle?: number;
    dungeon?: number;
    growth?: number;
  };
  /** Model id used (e.g. "gpt-5-mini"). */
  model?: string;
}

/**
 * One "Another Me" persona per user (1:1). Created lazily on first access (like
 * users are auto-provisioned). `level`/`xp`/`stats` are driven by deterministic
 * growth. The qualitative AI-analysis fields (`summary` + the six `*Style`/
 * `*Traits` text columns and `analysisMetadata`) are written only by the
 * on-demand AI analysis phase and stay null until the user runs it.
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
  /** AI: short overall persona summary (maps to AI `persona_summary`). */
  summary: text("summary"),
  /** AI: observed language / communication style. */
  languageStyle: text("language_style"),
  /** AI: estimated personality tendencies. */
  personalityTraits: text("personality_traits"),
  /** AI: apparent values / beliefs (non-sensitive, estimative). */
  valuesBeliefs: text("values_beliefs"),
  /** AI: knowledge domains the user engages with. */
  knowledgeDomains: text("knowledge_domains"),
  /** AI: emotional expression patterns. */
  emotionalPatterns: text("emotional_patterns"),
  /** AI: decision-making style. */
  decisionStyle: text("decision_style"),
  /** AI: bookkeeping for the latest analysis (confidence, counts, model). */
  analysisMetadata: jsonb("analysis_metadata").$type<PersonaAnalysisMetadata>(),
  /** Timestamp of the last successful AI analysis; drives the cooldown. */
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
