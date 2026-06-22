import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { chatRoomsTable } from "./chat";

export const callsTable = pgTable("calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomName: text("room_name").notNull(),
  callerId: uuid("caller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  calleeId: uuid("callee_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // The 1:1 chat room the call belongs to (nullable: a call may be placed
  // without an originating room). Used for the in-chat call card and for
  // routing a tapped incoming-call notification straight to the conversation.
  chatRoomId: uuid("chat_room_id").references(() => chatRoomsTable.id, {
    onDelete: "set null",
  }),
  // Full call lifecycle:
  // ringing → accepted/active → ended | declined | missed | cancelled | failed
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
});

export type Call = typeof callsTable.$inferSelect;
