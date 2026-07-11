import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  pvtTransactionsTable,
  pvtWalletsTable,
  type PvtTransactionSource,
  type PvtTransactionType,
} from "@workspace/db";
import { normalizePvtGrantAmount } from "./pvtPolicy";

export interface PvtWalletView {
  balance: number;
  updatedAt: string | null;
}

export interface PvtTransactionView {
  id: string;
  amount: number;
  type: PvtTransactionType;
  source: PvtTransactionSource;
  sourceId: string;
  description: string | null;
  balanceAfter: number;
  createdAt: string;
}

export async function getPvtWallet(userId: string): Promise<PvtWalletView> {
  await db
    .insert(pvtWalletsTable)
    .values({ userId, balance: 0 })
    .onConflictDoNothing({ target: pvtWalletsTable.userId });

  const [wallet] = await db
    .select()
    .from(pvtWalletsTable)
    .where(eq(pvtWalletsTable.userId, userId));

  return {
    balance: wallet?.balance ?? 0,
    updatedAt: wallet?.updatedAt?.toISOString() ?? null,
  };
}

export async function listPvtTransactions(userId: string, limit = 50): Promise<PvtTransactionView[]> {
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  const rows = await db
    .select()
    .from(pvtTransactionsTable)
    .where(eq(pvtTransactionsTable.userId, userId))
    .orderBy(desc(pvtTransactionsTable.createdAt))
    .limit(safeLimit);

  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    type: row.type,
    source: row.source,
    sourceId: row.sourceId,
    description: row.description ?? null,
    balanceAfter: row.balanceAfter,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function grantPvtInTransaction(
  tx: any,
  params: {
    userId: string;
    amount: number;
    source: PvtTransactionSource;
    sourceId: string;
    description: string;
  },
): Promise<{ balanceAfter: number }> {
  const amount = normalizePvtGrantAmount(params.amount);

  // The ledger's unique source key is global, so lock it before touching the
  // balance. This prevents two concurrent retries from both incrementing the
  // wallet before one loses the ledger insert conflict.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`anotherme:pvt:${params.source}:${params.sourceId}:EARN`}))`,
  );
  const [existing] = await tx
    .select({ balanceAfter: pvtTransactionsTable.balanceAfter })
    .from(pvtTransactionsTable)
    .where(
      and(
        eq(pvtTransactionsTable.source, params.source),
        eq(pvtTransactionsTable.sourceId, params.sourceId),
        eq(pvtTransactionsTable.type, "EARN"),
      ),
    )
    .limit(1);
  if (existing) return { balanceAfter: existing.balanceAfter };

  await tx
    .insert(pvtWalletsTable)
    .values({ userId: params.userId, balance: 0 })
    .onConflictDoNothing({ target: pvtWalletsTable.userId });

  const [wallet] = await tx
    .update(pvtWalletsTable)
    .set({
      balance: sql`${pvtWalletsTable.balance} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(pvtWalletsTable.userId, params.userId))
    .returning({ balance: pvtWalletsTable.balance });

  const balanceAfter = wallet?.balance ?? amount;
  const [transaction] = await tx
    .insert(pvtTransactionsTable)
    .values({
      userId: params.userId,
      amount,
      type: "EARN",
      source: params.source,
      sourceId: params.sourceId,
      description: params.description,
      balanceAfter,
    })
    .returning({ balanceAfter: pvtTransactionsTable.balanceAfter });

  return { balanceAfter: transaction?.balanceAfter ?? balanceAfter };
}
