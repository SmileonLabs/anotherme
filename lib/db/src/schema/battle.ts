import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { chatRoomsTable } from "./chat";
import { usersTable } from "./users";

/** Which side of the debate a participant argues. */
export type BattleSide = "pro" | "con";

/** A participant in the battle. There are exactly two (a human + a human, or a human + an AI persona). */
export interface BattleParticipant {
  userId: string;
  name: string;
  /** Assigned randomly at game start; "" while still in the waiting room. */
  side: BattleSide | "";
  /** Cumulative score across all evaluated turns. */
  totalScore: number;
  /** Whether this participant has pressed "ready" in the waiting room. */
  ready: boolean;
  /** True when this participant is an AI persona opponent (server generates its turns). */
  isAI?: boolean;
  /** AI persona id (e.g. "judge", "pastor") when isAI is true; drives its voice/avatar. */
  personaId?: string;
}

/**
 * The AI judge's evaluation of a single utterance. Each axis is 0..10; `total`
 * is their sum (0..50). `violation` marks abuse (욕설/인신공격/혐오) which forces
 * a low/zero score regardless of the axes.
 */
export interface BattleEvaluation {
  logic: number;
  persuasiveness: number;
  rebuttal: number;
  wit: number;
  manners: number;
  total: number;
  feedback: string;
  violation: boolean;
}

/**
 * Game phase, also mirrored onto `battleSessionsTable.status`:
 * - "waiting": in the waiting room; participants ready up before the host starts.
 * - "active": the debate is running, turns advance.
 * - "ended": all rounds evaluated, winner decided.
 */
export type BattlePhase = "waiting" | "active" | "ended";

export interface BattleState {
  topic: string;
  category: string;
  /** AI-generated opening question shown when the debate starts. */
  startQuestion: string;
  phase: BattlePhase;
  participants: BattleParticipant[];
  totalRounds: number;
  /** Seconds allowed per turn (server-authoritative). */
  timeLimitSeconds: number;
  /**
   * Speaking order within a round, as participant userIds (pro first, con
   * second). Empty until the game starts and sides are assigned.
   */
  order: string[];
  /**
   * 0-based index across the whole game (0 .. totalRounds*2 - 1). The current
   * round is `floor(turnIndex / 2) + 1` and the current speaker is
   * `order[turnIndex % 2]`. -1 before the game starts.
   */
  turnIndex: number;
  /** Whose turn it is right now (null when waiting or ended). */
  currentSpeakerUserId: string | null;
  /**
   * ISO timestamp when the current turn's clock started. Remaining time is
   * computed server-side as `timeLimitSeconds - (now - turnStartedAt)`; clients
   * only render a local countdown from this anchor so leaving/returning restores
   * the correct remaining time.
   */
  turnStartedAt: string | null;
  ended: boolean;
  /** Winner's userId, or null for a draw / not-yet-ended. */
  winnerUserId: string | null;
}

export const battleSessionsTable = pgTable("battle_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id")
    .notNull()
    .unique()
    .references(() => chatRoomsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("waiting"),
  topic: text("topic").notNull().default(""),
  category: text("category").notNull().default(""),
  state: jsonb("state").$type<BattleState>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * One row per submitted utterance, with the AI judge's evaluation. Kept as a
 * normalized table (rather than only in state JSON) so the result screen and
 * history can be reconstructed turn by turn.
 */
export const battleTurnsTable = pgTable("battle_turns", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => chatRoomsTable.id, { onDelete: "cascade" }),
  round: integer("round").notNull(),
  turnIndex: integer("turn_index").notNull(),
  speakerId: uuid("speaker_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  side: text("side").notNull(),
  content: text("content").notNull(),
  evaluation: jsonb("evaluation").$type<BattleEvaluation>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BattleSession = typeof battleSessionsTable.$inferSelect;
export type BattleTurn = typeof battleTurnsTable.$inferSelect;
