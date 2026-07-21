import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { chatRoomsTable } from "./chat";
import { characterProfilesTable } from "./characterProfiles";

export const callsTable = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomName: text("room_name").notNull(),
    callerId: uuid("caller_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    callerProfileId: uuid("caller_profile_id").references(() => characterProfilesTable.id, { onDelete: "set null" }),
    calleeId: uuid("callee_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    calleeProfileId: uuid("callee_profile_id").references(() => characterProfilesTable.id, { onDelete: "set null" }),
    // The 1:1 chat room the call belongs to (nullable: a call may be placed
    // without an originating room). Used for the in-chat call card and for
    // routing a tapped incoming-call notification straight to the conversation.
    chatRoomId: uuid("chat_room_id").references(() => chatRoomsTable.id, {
      onDelete: "set null",
    }),
    media: text("media").notNull().default("audio"),
    // Full call lifecycle:
    // ringing → active → ended | declined | missed | cancelled | failed
    status: text("status").notNull().default("ringing"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // Lifecycle timestamps — set once when the call enters the matching state.
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    missedAt: timestamp("missed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    // Room deletion is retried by the call lifecycle worker until it succeeds.
    roomTerminationAttemptedAt: timestamp("room_termination_attempted_at", { withTimezone: true }),
    roomTerminatedAt: timestamp("room_terminated_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("calls_room_name_unique_idx").on(t.roomName),
    index("calls_callee_status_created_at_idx").on(t.calleeId, t.status, t.createdAt),
    index("calls_caller_status_created_at_idx").on(t.callerId, t.status, t.createdAt),
    index("calls_status_created_at_idx").on(t.status, t.createdAt),
    index("calls_caller_profile_created_at_idx").on(t.callerProfileId, t.createdAt),
    index("calls_callee_profile_created_at_idx").on(t.calleeProfileId, t.createdAt),
    index("calls_room_termination_pending_idx")
      .on(t.roomTerminationAttemptedAt, t.endedAt)
      .where(
        sql`${t.roomTerminatedAt} IS NULL AND ${t.status} IN ('ended', 'declined', 'missed', 'cancelled', 'failed')`,
      ),
    check("calls_media_valid", sql`${t.media} IN ('audio', 'video')`),
    check(
      "calls_status_valid",
      sql`${t.status} IN ('ringing', 'active', 'ended', 'declined', 'missed', 'cancelled', 'failed')`,
    ),
    check("calls_distinct_participants", sql`${t.callerId} <> ${t.calleeId}`),
  ],
);

// A primary key on user_id is the concurrency guard for live calls. Rows are
// inserted with a ringing call and removed in the same transaction that makes
// the call terminal, so a user cannot be both caller and callee across calls.
export const callUserLocksTable = pgTable(
  "call_user_locks",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    callId: uuid("call_id")
      .notNull()
      .references(() => callsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("call_user_locks_call_id_idx").on(t.callId)],
);

export type Call = typeof callsTable.$inferSelect;
