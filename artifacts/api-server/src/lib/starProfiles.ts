import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getAddress } from "viem";
import {
  DEFAULT_STAR_STATS,
  db,
  starGrowthEventsTable,
  starProfilesTable,
  userPlayModesTable,
  userWalletsTable,
  type StarProfile,
  type StarStats,
} from "@workspace/db";
import {
  checkNftTokenOwner,
  getNftConfig,
  getStarIdentityForToken,
  normalizeTokenId,
} from "./nft";

export interface StarProfileView {
  id: string;
  starKey: string;
  displayName: string;
  tokenId: string;
  contractAddress: string;
  chainId: number;
  imageUrl: string | null;
  stage: "aspiring" | "promoted";
  level: number;
  xp: number;
  stats: StarStats;
  equippedAt: string | null;
  verifiedAt: string | null;
  torimiaOpenedAt: string | null;
  promotedAt: string | null;
}

export class StarProfileError extends Error {
  constructor(
    readonly code:
      | "wallet_required"
      | "config_missing"
      | "invalid_token_id"
      | "token_not_owned"
      | "nft_check_failed",
    message: string,
  ) {
    super(message);
  }
}

function computeStarLevel(xp: number): number {
  let level = 1;
  while (xp >= 50 * level * (level + 1)) level++;
  return level;
}

export function serializeStarProfile(profile: StarProfile | undefined | null): StarProfileView | null {
  if (!profile) return null;
  return {
    id: profile.id,
    starKey: profile.starKey,
    displayName: profile.displayName,
    tokenId: profile.tokenId,
    contractAddress: profile.contractAddress,
    chainId: profile.chainId,
    imageUrl: profile.imageUrl ?? null,
    stage: profile.stage === "promoted" ? "promoted" : "aspiring",
    level: profile.level,
    xp: profile.xp,
    stats: { ...DEFAULT_STAR_STATS, ...profile.stats },
    equippedAt: profile.equippedAt?.toISOString() ?? null,
    verifiedAt: profile.verifiedAt?.toISOString() ?? null,
    torimiaOpenedAt: profile.torimiaOpenedAt?.toISOString() ?? null,
    promotedAt: profile.promotedAt?.toISOString() ?? null,
  };
}

export async function getEquippedStarProfile(userId: string): Promise<StarProfileView | null> {
  const [profile] = await db
    .select()
    .from(starProfilesTable)
    .where(and(eq(starProfilesTable.userId, userId), isNotNull(starProfilesTable.equippedAt)))
    .orderBy(desc(starProfilesTable.equippedAt))
    .limit(1);
  return serializeStarProfile(profile);
}

async function setStarUnlocked(userId: string): Promise<void> {
  await db.insert(userPlayModesTable).values({ userId }).onConflictDoNothing();
  await db
    .update(userPlayModesTable)
    .set({ starUnlocked: true, currentMode: "star" })
    .where(eq(userPlayModesTable.userId, userId));
}

export async function equipStarNft(params: {
  userId: string;
  tokenId: string;
}): Promise<StarProfileView> {
  let tokenId: string;
  try {
    tokenId = normalizeTokenId(params.tokenId);
  } catch {
    throw new StarProfileError("invalid_token_id", "NFT 번호는 숫자로 입력해 주세요.");
  }

  const [wallet] = await db
    .select()
    .from(userWalletsTable)
    .where(and(eq(userWalletsTable.userId, params.userId), isNotNull(userWalletsTable.verifiedAt)))
    .orderBy(desc(userWalletsTable.updatedAt))
    .limit(1);
  if (!wallet) {
    throw new StarProfileError("wallet_required", "먼저 지갑을 인증해 주세요.");
  }

  const config = getNftConfig();
  if (!config.configured || !config.contractAddress || !config.chainId) {
    throw new StarProfileError("config_missing", "NFT 컨트랙트 설정 후 장착할 수 있어요.");
  }

  let owner;
  try {
    owner = await checkNftTokenOwner(tokenId);
  } catch {
    throw new StarProfileError("nft_check_failed", "NFT 소유자를 확인하지 못했어요.");
  }
  if (!owner.configured || !owner.owner) {
    throw new StarProfileError("config_missing", "NFT 컨트랙트 설정 후 장착할 수 있어요.");
  }

  const walletAddress = getAddress(wallet.walletAddress);
  if (owner.owner !== walletAddress) {
    throw new StarProfileError("token_not_owned", "인증한 지갑이 이 NFT를 보유하고 있지 않아요.");
  }

  const identity = getStarIdentityForToken(tokenId);
  const now = new Date();
  const [profile] = await db.transaction(async (tx) => {
    await tx
      .update(starProfilesTable)
      .set({ equippedAt: null })
      .where(eq(starProfilesTable.userId, params.userId));

    return tx
      .insert(starProfilesTable)
      .values({
        userId: params.userId,
        walletAddress,
        chainId: config.chainId!,
        contractAddress: config.contractAddress!,
        tokenId,
        starKey: identity.starKey,
        displayName: identity.displayName,
        verifiedAt: now,
        equippedAt: now,
      })
      .onConflictDoUpdate({
        target: [starProfilesTable.chainId, starProfilesTable.contractAddress, starProfilesTable.tokenId],
        set: {
          userId: params.userId,
          walletAddress,
          starKey: identity.starKey,
          displayName: identity.displayName,
          verifiedAt: now,
          equippedAt: now,
          updatedAt: now,
        },
      })
      .returning();
  });

  if (!profile) throw new Error("star profile equip failed");
  await setStarUnlocked(params.userId);
  await recordStarActivity({
    userId: params.userId,
    sourceKey: `star_equip:${profile.chainId}:${profile.contractAddress}:${profile.tokenId}:${params.userId}`,
    eventType: "nft_equip",
    xp: 20,
    stats: { bond: 2, lore: 1 },
    reason: `${profile.displayName} NFT 장착`,
    metadata: { tokenId: profile.tokenId, starKey: profile.starKey },
  });

  const equipped = await getEquippedStarProfile(params.userId);
  if (!equipped) throw new Error("equipped star profile reload failed");
  return equipped;
}

export async function recordStarActivity(params: {
  userId: string;
  sourceKey: string;
  eventType: string;
  xp: number;
  stats?: Partial<StarStats>;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  if (params.xp <= 0) return false;
  const [profile] = await db
    .select()
    .from(starProfilesTable)
    .where(and(eq(starProfilesTable.userId, params.userId), isNotNull(starProfilesTable.equippedAt)))
    .orderBy(desc(starProfilesTable.equippedAt))
    .limit(1);
  if (!profile) return false;

  let granted = false;
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(starProfilesTable)
      .where(eq(starProfilesTable.id, profile.id))
      .for("update");
    if (!locked) return;

    const beforeXp = locked.xp;
    const beforeLevel = locked.level;
    const afterXp = beforeXp + params.xp;
    const afterLevel = computeStarLevel(afterXp);
    const nextStats: StarStats = { ...DEFAULT_STAR_STATS, ...locked.stats };
    const cleanStats: Partial<StarStats> = {};
    for (const [key, delta] of Object.entries(params.stats ?? {})) {
      if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) continue;
      const stat = key as keyof StarStats;
      const value = Math.trunc(delta);
      nextStats[stat] = (nextStats[stat] ?? 0) + value;
      cleanStats[stat] = value;
    }

    const inserted = await tx
      .insert(starGrowthEventsTable)
      .values({
        starProfileId: locked.id,
        userId: params.userId,
        sourceKey: params.sourceKey,
        eventType: params.eventType,
        xpDelta: params.xp,
        statChanges: cleanStats,
        reason: params.reason ?? null,
        metadata: params.metadata ?? null,
        beforeLevel,
        afterLevel,
        beforeXp,
        afterXp,
      })
      .onConflictDoNothing({ target: starGrowthEventsTable.sourceKey })
      .returning({ id: starGrowthEventsTable.id });
    if (inserted.length === 0) return;

    await tx
      .update(starProfilesTable)
      .set({ xp: afterXp, level: afterLevel, stats: nextStats })
      .where(eq(starProfilesTable.id, locked.id));
    granted = true;
  });

  return granted;
}
