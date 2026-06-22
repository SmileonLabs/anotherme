import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { chatRoomsTable } from "./chat";

export interface DungeonCharacter {
  userId: string;
  name: string;
  hp: number;
  maxHp: number;
  status: string;
  inventory: string[];
}

export interface DungeonEnemy {
  name: string;
  hp: number;
  maxHp: number;
}

export type DungeonEventKind =
  | "spawn"
  | "playerHit"
  | "enemyHit"
  | "heal"
  | "loot"
  | "death"
  | "score"
  | "info";

export interface DungeonEvent {
  kind: DungeonEventKind;
  text: string;
  /** For playerHit/heal: the affected party member's userId. */
  targetUserId?: string;
  /** For score events: the signed game-point delta (+gain / -loss). */
  points?: number;
}

/**
 * A dungeon mission objective. There is exactly one `main` goal (the win
 * condition that ends the run when done) plus a handful of `sub` goals
 * (intermediate steps). Goals are authored by the DM on the opening turn and
 * marked `done` as the party achieves them.
 */
export interface DungeonGoal {
  text: string;
  kind: "main" | "sub";
  done: boolean;
}

export interface DungeonState {
  scene: string;
  party: DungeonCharacter[];
  /** Monsters currently in the encounter (empty when out of combat). */
  enemies: DungeonEnemy[];
  /** Mission objectives: one main (win condition) + optional sub goals. */
  goals: DungeonGoal[];
  /** Shared party score; good choices add, bad choices subtract. */
  points: number;
  turn: number;
  ended: boolean;
  /** Suggested next actions the player can tap to send instantly. */
  choices: string[];
  /** Combat/state-change events from the most recent turn (drives animations + system lines). */
  lastTurnEvents: DungeonEvent[];
  /**
   * The message id of the DM narrative bubble written for the current turn.
   * The client gates the choices footer on this so the options only appear once
   * the matching narrative is on screen (never before the story), regardless of
   * poll/fetch ordering. Optional for sessions created before this field existed.
   */
  lastNarrativeMessageId?: string;
}

export const dungeonSessionsTable = pgTable("dungeon_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id")
    .notNull()
    .unique()
    .references(() => chatRoomsTable.id, { onDelete: "cascade" }),
  theme: text("theme").notNull().default("fantasy"),
  status: text("status").notNull().default("active"),
  state: jsonb("state").$type<DungeonState>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type DungeonSession = typeof dungeonSessionsTable.$inferSelect;
