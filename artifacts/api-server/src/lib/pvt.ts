import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  characterProfileQuestProgressTable,
  characterProfilesTable,
  db,
  pvtTransactionsTable,
  pvtWalletsTable,
  type PvtTransactionSource,
  type PvtTransactionType,
} from "@workspace/db";
import { normalizePvtGrantAmount } from "./pvtPolicy";
import { DAILY_QUESTS, WEEKLY_QUESTS } from "./questDefinitions";

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

const QUEST_TITLE_BY_KEY = new Map(
  [...DAILY_QUESTS, ...WEEKLY_QUESTS].map((quest) => [quest.key, quest.title]),
);

async function backfillClaimedMissionRewards(userId: string): Promise<void> {
  const [claimed, existing] = await Promise.all([
    db
      .select({
        profileId: characterProfileQuestProgressTable.profileId,
        questKey: characterProfileQuestProgressTable.questKey,
        periodKey: characterProfileQuestProgressTable.periodKey,
        rewardXp: characterProfileQuestProgressTable.rewardXp,
      })
      .from(characterProfileQuestProgressTable)
      .innerJoin(
        characterProfilesTable,
        eq(characterProfilesTable.id, characterProfileQuestProgressTable.profileId),
      )
      .where(and(
        eq(characterProfilesTable.ownerUserId, userId),
        isNotNull(characterProfileQuestProgressTable.rewardClaimedAt),
      )),
    db
      .select({ sourceId: pvtTransactionsTable.sourceId })
      .from(pvtTransactionsTable)
      .where(and(
        eq(pvtTransactionsTable.userId, userId),
        eq(pvtTransactionsTable.source, "MISSION"),
        eq(pvtTransactionsTable.type, "EARN"),
      )),
  ]);
  const recorded = new Set(existing.map((row) => row.sourceId));
  for (const row of claimed) {
    if (row.rewardXp <= 0) continue;
    const sourceId = `profile-quest:${row.profileId}:${row.periodKey}:${row.questKey}`;
    if (recorded.has(sourceId)) continue;
    await db.transaction((tx) =>
      grantPvtInTransaction(tx, {
        userId,
        amount: row.rewardXp,
        source: "MISSION",
        sourceId,
        description: `미션 보상 · ${QUEST_TITLE_BY_KEY.get(row.questKey) ?? row.questKey}`,
      }),
    );
    recorded.add(sourceId);
  }
}

export async function getPvtWallet(userId: string): Promise<PvtWalletView> {
  await backfillClaimedMissionRewards(userId);
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
  await backfillClaimedMissionRewards(userId);
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

/**
 * Atomically spends STAR Point and records the negative ledger entry. Reusing
 * the same source id is idempotent, which protects purchases from double taps
 * and client retries.
 */
export async function spendPvtInTransaction(
  tx: any,
  params: {
    userId: string;
    amount: number;
    source: PvtTransactionSource;
    sourceId: string;
    description: string;
  },
): Promise<{ balanceAfter: number; spent: boolean }> {
  const amount = normalizePvtGrantAmount(params.amount);
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`anotherme:pvt:${params.source}:${params.sourceId}:SPEND`}))`,
  );
  const [existing] = await tx
    .select({ balanceAfter: pvtTransactionsTable.balanceAfter })
    .from(pvtTransactionsTable)
    .where(and(
      eq(pvtTransactionsTable.userId, params.userId),
      eq(pvtTransactionsTable.source, params.source),
      eq(pvtTransactionsTable.sourceId, params.sourceId),
      eq(pvtTransactionsTable.type, "SPEND"),
    ))
    .limit(1);
  if (existing) return { balanceAfter: existing.balanceAfter, spent: false };

  await tx.insert(pvtWalletsTable).values({ userId: params.userId, balance: 0 })
    .onConflictDoNothing({ target: pvtWalletsTable.userId });
  const [wallet] = await tx.select().from(pvtWalletsTable)
    .where(eq(pvtWalletsTable.userId, params.userId)).for("update");
  if (!wallet || wallet.balance < amount) {
    const error = new Error("Insufficient STAR Point balance");
    (error as Error & { code?: string }).code = "INSUFFICIENT_STAR_POINT";
    throw error;
  }

  const balanceAfter = wallet.balance - amount;
  await tx.update(pvtWalletsTable).set({ balance: balanceAfter, updatedAt: new Date() })
    .where(eq(pvtWalletsTable.userId, params.userId));
  await tx.insert(pvtTransactionsTable).values({
    userId: params.userId,
    amount: -amount,
    type: "SPEND",
    source: params.source,
    sourceId: params.sourceId,
    description: params.description,
    balanceAfter,
  });
  return { balanceAfter, spent: true };
}
