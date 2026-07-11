import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const chatRoomsTable = pgTable("chat_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  name: text("name"),
  ownerId: uuid("owner_id").references(() => usersTable.id),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  lastMessageSeq: integer("last_message_seq").notNull().default(0),
  pinnedMessageId: uuid("pinned_message_id"),
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
    lastReadSeq: integer("last_read_seq").notNull().default(0),
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
    index("chat_room_members_room_id_last_read_seq_idx").on(t.roomId, t.lastReadSeq),
  ],
);

export const messagesTable = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id").notNull().references(() => chatRoomsTable.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    authorKind: text("author_kind").notNull().default("user"),
    type: text("type").notNull().default("text"),
    content: text("content").notNull(),
    replyToMessageId: uuid("reply_to_message_id"),
    anotherMeSessionId: uuid("another_me_session_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    roomSeq: integer("room_seq").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Every message read path (history, unread count, last-message) filters by
    // room_id and orders by created_at — the hottest query under 3s polling.
    index("messages_room_id_created_at_idx").on(t.roomId, t.createdAt),
    index("messages_room_id_room_seq_idx").on(t.roomId, t.roomSeq),
    uniqueIndex("messages_room_id_room_seq_unique_idx")
      .on(t.roomId, t.roomSeq)
      .where(sql`${t.roomSeq} > 0`),
  ],
);

export const messageDeletionsTable = pgTable(
  "message_deletions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").notNull().references(() => messagesTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("message_deletions_message_id_user_id_idx").on(t.messageId, t.userId),
    index("message_deletions_user_id_idx").on(t.userId),
  ],
);

export const messageStickersTable = pgTable(
  "message_stickers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").notNull().references(() => messagesTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("message_stickers_message_id_user_id_idx").on(t.messageId, t.userId),
    index("message_stickers_message_id_idx").on(t.messageId),
  ],
);

export const messageLinkPreviewsTable = pgTable(
  "message_link_previews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").notNull().references(() => messagesTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    domain: text("domain"),
    title: text("title"),
    description: text("description"),
    imageUrl: text("image_url"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("message_link_previews_message_id_idx").on(t.messageId),
    index("message_link_previews_status_idx").on(t.status),
  ],
);

export type ChatRoom = typeof chatRoomsTable.$inferSelect;
export type ChatRoomMember = typeof chatRoomMembersTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
export type MessageDeletion = typeof messageDeletionsTable.$inferSelect;
export type MessageSticker = typeof messageStickersTable.$inferSelect;
export type MessageLinkPreview = typeof messageLinkPreviewsTable.$inferSelect;
