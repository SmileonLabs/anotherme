import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const chatRoomsTable = pgTable("chat_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  name: text("name"),
  ownerId: uuid("owner_id").references(() => usersTable.id),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const chatRoomMembersTable = pgTable(
  "chat_room_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id").notNull().references(() => chatRoomsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastReadMessageId: uuid("last_read_message_id"),
    muted: boolean("muted").notNull().default(false),
    // When set, the room is hidden from this member's room list (used for "leaving"
    // a 1:1 chat without destroying the other party's history). Cleared when the
    // member re-enters the room or a new message arrives.
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  },
  (t) => [
    // GET /rooms filters members by user_id (polled every 3s); membership checks
    // on every room/message request filter by room_id.
    index("chat_room_members_user_id_idx").on(t.userId),
    index("chat_room_members_room_id_idx").on(t.roomId),
  ],
);

export const messagesTable = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id").notNull().references(() => chatRoomsTable.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("text"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Every message read path (history, unread count, last-message) filters by
    // room_id and orders by created_at — the hottest query under 3s polling.
    index("messages_room_id_created_at_idx").on(t.roomId, t.createdAt),
  ],
);

export type ChatRoom = typeof chatRoomsTable.$inferSelect;
export type ChatRoomMember = typeof chatRoomMembersTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
