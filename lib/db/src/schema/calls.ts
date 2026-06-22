import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const callsTable = pgTable("calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomName: text("room_name").notNull(),
  callerId: uuid("caller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  calleeId: uuid("callee_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("ringing"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export type Call = typeof callsTable.$inferSelect;
