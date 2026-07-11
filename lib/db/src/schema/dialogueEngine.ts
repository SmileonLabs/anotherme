import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const dialogueStatesTable = pgTable(
  "dialogue_states",
  {
    roomId: uuid("room_id").notNull(),
    personaUserId: uuid("persona_user_id").notNull(),
    targetUserId: uuid("target_user_id").notNull(),
    relationshipPhase: text("relationship_phase").notNull().default("first_contact"),
    allowedCasualness: text("allowed_casualness").notNull().default("none"),
    userStyle: text("user_style").notNull().default("unknown"),
    currentTopic: text("current_topic"),
    lastDialogueAct: text("last_dialogue_act"),
    lastBoundaryAt: timestamp("last_boundary_at", { withTimezone: true }),
    recentAiOpeners: jsonb("recent_ai_openers").notNull().default(sql`'[]'::jsonb`),
    repeatedFailureCount: integer("repeated_failure_count").notNull().default(0),
    snapshotJson: jsonb("snapshot_json").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.roomId, t.personaUserId, t.targetUserId] }),
    index("dialogue_states_persona_target_idx").on(t.personaUserId, t.targetUserId),
  ],
);

export const dialogueTurnsTable = pgTable(
  "dialogue_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id").notNull(),
    personaUserId: uuid("persona_user_id").notNull(),
    targetUserId: uuid("target_user_id").notNull(),
    userMessageId: uuid("user_message_id"),
    userText: text("user_text").notNull(),
    intent: text("intent").notNull(),
    emotion: text("emotion").notNull(),
    respectSignal: text("respect_signal").notNull(),
    dialogueAct: text("dialogue_act").notNull(),
    factLookupNeeded: boolean("fact_lookup_needed").notNull().default(false),
    replyMessagesJson: jsonb("reply_messages_json").notNull().default(sql`'[]'::jsonb`),
    humanLikenessScore: integer("human_likeness_score").notNull().default(0),
    repetitionScore: integer("repetition_score").notNull().default(0),
    metadataJson: jsonb("metadata_json").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("dialogue_turns_room_created_idx").on(t.roomId, t.createdAt)],
);

export const anotherMeReplyJobsTable = pgTable(
  "another_me_reply_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id").notNull(),
    personaUserId: uuid("persona_user_id").notNull(),
    targetUserId: uuid("target_user_id").notNull(),
    latestMessageId: uuid("latest_message_id").notNull(),
    userInput: text("user_input").notNull(),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("another_me_reply_jobs_status_available_idx").on(t.status, t.availableAt, t.createdAt)],
);
