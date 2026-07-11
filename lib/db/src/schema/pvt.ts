import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const PVT_TRANSACTION_TYPES = ["EARN", "SPEND", "ADJUST"] as const;
export type PvtTransactionType = (typeof PVT_TRANSACTION_TYPES)[number];

export const PVT_TRANSACTION_SOURCES = ["DAILY_TALK_REWARD", "EVENT", "ADMIN", "MISSION"] as const;
export type PvtTransactionSource = (typeof PVT_TRANSACTION_SOURCES)[number];

export const pvtWalletsTable = pgTable(
  "pvt_wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    balance: integer("balance").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("pvt_wallets_user_id_idx").on(t.userId),
    check("pvt_wallets_balance_nonnegative", sql`${t.balance} >= 0`),
  ],
);

export const pvtTransactionsTable = pgTable(
  "pvt_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    type: text("type").$type<PvtTransactionType>().notNull(),
    source: text("source").$type<PvtTransactionSource>().notNull(),
    sourceId: text("source_id").notNull(),
    description: text("description"),
    balanceAfter: integer("balance_after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pvt_transactions_source_unique_idx").on(t.source, t.sourceId, t.type),
    index("pvt_transactions_user_created_at_idx").on(t.userId, t.createdAt),
  ],
);

export type PvtWallet = typeof pvtWalletsTable.$inferSelect;
export type PvtTransaction = typeof pvtTransactionsTable.$inferSelect;
