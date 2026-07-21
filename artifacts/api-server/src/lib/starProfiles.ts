import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getAddress } from "viem";
import {
  DEFAULT_STAR_STATS,
  characterGrowthEventsTable,
  characterProfilesTable,
  db,
  starGrowthEventsTable,
  starProfilesTable,
  userPlayModesTable,
  userWalletsTable,
  nftCollectionsTable,
  nftEvolutionStagesTable,
  type StarProfile,
  type StarStats,
} from "@workspace/db";
import {
  checkNftTokenOwnerWithConfig,
  getNftConfig,
  getStarIdentityForToken,
  normalizeTokenId,
  type NftConfig,
} from "./nft";
import { resolveNftReferenceImage } from "./nftReferenceImage";
import { ObjectStorageService } from "./objectStorage";
import { computeEvolutionStage, computeStarLevel } from "./starGrowthPolicy";
import { getNftPublishReadiness } from "./nftRpgContent";

const OWNERSHIP_RECHECK_MS = 2 * 60 * 1000;

export interface StarProfileView {
  id: string;
  starKey: string;
  displayName: string;
  tokenId: string;
  contractAddress: string;
  chainId: number;
  collectionId: string | null;
  category: string;
  ownershipStatus: string;
  currentEvolutionStage: string;
  metadata: Record<string, unknown> | null;
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
      | "star_not_owned"
      | "token_not_owned"
      | "nft_check_failed"
      | "collection_expansion_locked",
    message: string,
  ) {
    super(message);
  }
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
    collectionId: profile.collectionId ?? null,
    category: profile.category ?? "idol",
    ownershipStatus: profile.ownershipStatus ?? "verified",
    currentEvolutionStage: profile.currentEvolutionStage ?? "base",
    metadata: profile.metadata ?? null,
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

function unconfiguredNftConfig(chainId: number | null = null): NftConfig {
  return { configured: false, rpcUrl: null, contractAddress: null, chainId };
}

function collectionNftConfig(collection: typeof nftCollectionsTable.$inferSelect): NftConfig {
  let contractAddress: `0x${string}` | null = null;
  try {
    contractAddress = getAddress(collection.contractAddress);
  } catch {
    return unconfiguredNftConfig(collection.chainId);
  }
  return {
    configured: Boolean(collection.rpcUrl && collection.chainId > 0),
    rpcUrl: collection.rpcUrl,
    contractAddress,
    chainId: collection.chainId,
  };
}

async function resolveProfileNftConfig(profile: StarProfile): Promise<{
  config: NftConfig;
  published: boolean;
}> {
  let profileContract: `0x${string}`;
  try {
    profileContract = getAddress(profile.contractAddress);
  } catch {
    return { config: unconfiguredNftConfig(profile.chainId), published: false };
  }

  if (profile.collectionId) {
    const [collection] = await db
      .select()
      .from(nftCollectionsTable)
      .where(eq(nftCollectionsTable.id, profile.collectionId))
      .limit(1);
    if (!collection) {
      return { config: unconfiguredNftConfig(profile.chainId), published: false };
    }
    const config = collectionNftConfig(collection);
    const stages = await db.select().from(nftEvolutionStagesTable)
      .where(eq(nftEvolutionStagesTable.collectionId, collection.id));
    const matchesProfile =
      config.chainId === profile.chainId && config.contractAddress === profileContract;
    return {
      config: matchesProfile ? config : unconfiguredNftConfig(profile.chainId),
      published: collection.status === "published" && getNftPublishReadiness(collection, stages).ready,
    };
  }

  const config = getNftConfig();
  const matchesProfile =
    config.chainId === profile.chainId && config.contractAddress === profileContract;
  return {
    config: matchesProfile ? config : unconfiguredNftConfig(profile.chainId),
    published: matchesProfile,
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

/**
 * A user can own several IP/NFT-backed STAR profiles.  `equippedAt` identifies
 * the one currently acting as the user's STAR identity; it does not remove or
 * deactivate the rest of the user's collection.
 */
export async function listStarProfiles(userId: string): Promise<StarProfileView[]> {
  const profiles = await db
    .select()
    .from(starProfilesTable)
    .where(eq(starProfilesTable.userId, userId))
    .orderBy(desc(starProfilesTable.equippedAt), desc(starProfilesTable.verifiedAt), desc(starProfilesTable.createdAt));
  return profiles.flatMap((profile) => {
    const view = serializeStarProfile(profile);
    return view ? [view] : [];
  });
}

export async function revalidateStarProfiles(userId: string): Promise<StarProfileView[]> {
  const profiles = await db.select().from(starProfilesTable).where(eq(starProfilesTable.userId, userId));
  for (const profile of profiles) {
    try {
      const { config, published } = await resolveProfileNftConfig(profile);
      if (!config.configured) throw new Error("nft_config_missing");
      const owner = await checkNftTokenOwnerWithConfig(profile.tokenId, config);
      const owned = Boolean(owner.owner && owner.owner === getAddress(profile.walletAddress));
      await db.update(starProfilesTable).set({
        ownershipStatus: owned ? "verified" : "lost",
        verifiedAt: owned ? new Date() : profile.verifiedAt,
        equippedAt: owned && published ? profile.equippedAt : null,
        updatedAt: new Date(),
      }).where(eq(starProfilesTable.id, profile.id));
    } catch {
      await db.update(starProfilesTable).set({ ownershipStatus: "pending", updatedAt: new Date() }).where(eq(starProfilesTable.id, profile.id));
    }
  }
  return listStarProfiles(userId);
}

export async function ensureActiveStarOwnership(params: {
  userId: string;
  starProfileId: string;
  force?: boolean;
}): Promise<StarProfileView> {
  const [profile] = await db.select().from(starProfilesTable)
    .where(and(
      eq(starProfilesTable.id, params.starProfileId),
      eq(starProfilesTable.userId, params.userId),
      isNotNull(starProfilesTable.equippedAt),
    ))
    .limit(1);
  if (!profile) throw new StarProfileError("star_not_owned", "장착한 STAR를 찾을 수 없어요.");
  const fresh = profile.ownershipStatus === "verified"
    && profile.verifiedAt != null
    && Date.now() - profile.verifiedAt.getTime() < OWNERSHIP_RECHECK_MS;
  const resolved = await resolveProfileNftConfig(profile);
  if (!resolved.published || !resolved.config.configured) {
    await db.update(starProfilesTable)
      .set({ equippedAt: null, ownershipStatus: "pending", updatedAt: new Date() })
      .where(eq(starProfilesTable.id, profile.id));
    throw new StarProfileError("config_missing", "현재 공개 중인 NFT 컬렉션만 성장시킬 수 있어요.");
  }
  if (fresh && !params.force) return serializeStarProfile(profile)!;

  try {
    const currentOwner = await checkNftTokenOwnerWithConfig(profile.tokenId, resolved.config);
    if (!currentOwner.owner || currentOwner.owner !== getAddress(profile.walletAddress)) {
      await db.update(starProfilesTable)
        .set({ equippedAt: null, ownershipStatus: "lost", updatedAt: new Date() })
        .where(eq(starProfilesTable.id, profile.id));
      throw new StarProfileError("token_not_owned", "NFT 소유권이 확인되지 않아 STAR 성장이 중지됐어요.");
    }
  } catch (error) {
    if (error instanceof StarProfileError) throw error;
    await db.update(starProfilesTable)
      .set({ ownershipStatus: "pending", updatedAt: new Date() })
      .where(eq(starProfilesTable.id, profile.id));
    throw new StarProfileError("nft_check_failed", "NFT 소유권을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  const now = new Date();
  const [verified] = await db.update(starProfilesTable)
    .set({ ownershipStatus: "verified", verifiedAt: now, updatedAt: now })
    .where(eq(starProfilesTable.id, profile.id))
    .returning();
  return serializeStarProfile(verified)!;
}

export async function activateStarProfile(params: {
  userId: string;
  starProfileId: string;
}): Promise<StarProfileView> {
  const [owned] = await db
    .select()
    .from(starProfilesTable)
    .where(and(eq(starProfilesTable.id, params.starProfileId), eq(starProfilesTable.userId, params.userId)))
    .limit(1);
  if (!owned) {
    throw new StarProfileError("star_not_owned", "선택한 STAR 프로필을 찾을 수 없어요.");
  }

  const resolved = await resolveProfileNftConfig(owned);
  if (!resolved.published || !resolved.config.configured) {
    throw new StarProfileError("config_missing", "현재 공개 중인 NFT 컬렉션만 활성화할 수 있어요.");
  }

  let currentOwner;
  try {
    currentOwner = await checkNftTokenOwnerWithConfig(owned.tokenId, resolved.config);
  } catch {
    await db
      .update(starProfilesTable)
      .set({ ownershipStatus: "pending", equippedAt: null, updatedAt: new Date() })
      .where(eq(starProfilesTable.id, owned.id));
    throw new StarProfileError("nft_check_failed", "NFT 소유자를 확인하지 못했어요.");
  }
  if (!currentOwner.owner || currentOwner.owner !== getAddress(owned.walletAddress)) {
    await db
      .update(starProfilesTable)
      .set({ ownershipStatus: "lost", equippedAt: null, updatedAt: new Date() })
      .where(eq(starProfilesTable.id, owned.id));
    throw new StarProfileError("token_not_owned", "현재 인증한 지갑이 이 NFT를 보유하고 있지 않아요.");
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(starProfilesTable)
      .set({ equippedAt: null, updatedAt: now })
      .where(eq(starProfilesTable.userId, params.userId));
    await tx
      .update(starProfilesTable)
      .set({ ownershipStatus: "verified", verifiedAt: now, equippedAt: now, updatedAt: now })
      .where(and(eq(starProfilesTable.id, params.starProfileId), eq(starProfilesTable.userId, params.userId)));
  });

  const active = await getEquippedStarProfile(params.userId);
  if (!active) throw new Error("active STAR profile reload failed");
  return active;
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
  collectionId?: string;
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

  let collection: (typeof nftCollectionsTable.$inferSelect & { rpcUrl?: string | null }) | null = null;
  if (params.collectionId) {
    const [selected] = await db.select().from(nftCollectionsTable).where(eq(nftCollectionsTable.id, params.collectionId)).limit(1) as Array<typeof nftCollectionsTable.$inferSelect & { rpcUrl?: string | null }>;
    if (!selected || selected.status !== "published") {
      throw new StarProfileError("config_missing", "공개된 NFT 컬렉션만 소환할 수 있어요.");
    }
    const stages = await db.select().from(nftEvolutionStagesTable)
      .where(eq(nftEvolutionStagesTable.collectionId, selected.id));
    if (!getNftPublishReadiness(selected, stages).ready) {
      throw new StarProfileError("config_missing", "검토와 성장 준비가 완료된 NFT 컬렉션만 소환할 수 있어요.");
    }
    collection = selected;
  }
  const envConfig = getNftConfig();
  const config = collection
    ? { configured: Boolean(collection.rpcUrl && collection.contractAddress && collection.chainId), rpcUrl: collection.rpcUrl ?? null, contractAddress: (() => { try { return getAddress(collection!.contractAddress) as `0x${string}`; } catch { return null; } })(), chainId: collection.chainId }
    : envConfig;
  if (!config.configured || !config.contractAddress || !config.chainId) {
    throw new StarProfileError("config_missing", "NFT 컨트랙트 설정 후 장착할 수 있어요.");
  }

  let owner;
  try {
    owner = await checkNftTokenOwnerWithConfig(tokenId, config);
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

  const identity = collection
    ? { starKey: `${collection.ipName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${tokenId}`, displayName: `${collection.ipName} #${tokenId}` }
    : getStarIdentityForToken(tokenId);
  const now = new Date();
  const [existingProfile] = await db.select()
    .from(starProfilesTable)
    .where(and(
      eq(starProfilesTable.chainId, config.chainId),
      eq(starProfilesTable.contractAddress, config.contractAddress),
      eq(starProfilesTable.tokenId, tokenId),
      eq(starProfilesTable.ownershipStatus, "verified"),
    ))
    .limit(1);
  if (collection) {
    const sameCollectionProfiles = await db.select().from(starProfilesTable).where(and(
      eq(starProfilesTable.userId, params.userId),
      eq(starProfilesTable.collectionId, collection.id),
      eq(starProfilesTable.ownershipStatus, "verified"),
    ));
    const otherTokenProfiles = sameCollectionProfiles.filter((candidate) => candidate.tokenId !== tokenId);
    if (otherTokenProfiles.length > 0 && !otherTokenProfiles.some((candidate) => candidate.stage === "promoted" || candidate.torimiaOpenedAt !== null)) {
      throw new StarProfileError("collection_expansion_locked", "같은 컬렉션의 기존 STAR가 토르미아에 도달해야 추가 소환할 수 있어요.");
    }
  }
  let nftImageUrl = typeof existingProfile?.metadata?.nftImageUrl === "string"
    ? existingProfile.metadata.nftImageUrl
    : null;
  if (collection && !nftImageUrl) {
    try {
      const reference = await resolveNftReferenceImage({
        chainId: collection.chainId,
        contractAddress: collection.contractAddress,
        rpcUrl: collection.rpcUrl,
        metadataUrl: collection.metadataUrl,
        tokenId,
      });
      nftImageUrl = await new ObjectStorageService().uploadObjectEntity(reference.data, reference.contentType);
    } catch {
      // Ownership verification is authoritative; an unavailable metadata image
      // must not turn a valid NFT equip into a false ownership failure.
    }
  }
  const profileMetadata = collection
    ? {
        ...(existingProfile?.metadata ?? {}),
        ipName: collection.ipName,
        worldStyle: collection.worldStyle,
        roleName: collection.roleName,
        ...(nftImageUrl ? { nftImageUrl } : {}),
      }
    : null;
  const [profile] = await db.transaction(async (tx) => {
    await tx
      .update(starProfilesTable)
      .set({ equippedAt: null })
      .where(eq(starProfilesTable.userId, params.userId));

    if (existingProfile?.userId === params.userId && existingProfile.ownershipStatus === "verified") {
      return tx.update(starProfilesTable).set({
        walletAddress,
        collectionId: collection?.id ?? null,
        category: collection?.category ?? "idol",
        metadata: profileMetadata,
        ...(nftImageUrl ? { imageUrl: nftImageUrl } : {}),
        starKey: identity.starKey,
        displayName: identity.displayName,
        verifiedAt: now,
        equippedAt: now,
        updatedAt: now,
      }).where(eq(starProfilesTable.id, existingProfile.id)).returning();
    }

    if (existingProfile && existingProfile.userId !== params.userId && existingProfile.ownershipStatus === "verified") {
      await tx.update(starProfilesTable).set({ ownershipStatus: "transferred", equippedAt: null, updatedAt: now })
        .where(eq(starProfilesTable.id, existingProfile.id));
      await tx.update(characterProfilesTable).set({ status: "locked", updatedAt: now })
        .where(eq(characterProfilesTable.id, existingProfile.id));
    }

    return tx.insert(starProfilesTable).values({
        userId: params.userId,
        walletAddress,
        chainId: config.chainId!,
        contractAddress: config.contractAddress!,
        collectionId: collection?.id ?? null,
        category: collection?.category ?? "idol",
        metadata: profileMetadata,
        imageUrl: nftImageUrl,
        tokenId,
        starKey: identity.starKey,
        displayName: identity.displayName,
        verifiedAt: now,
        equippedAt: now,
      })
      .returning();
  });

  if (!profile) throw new Error("star profile equip failed");
  await setStarUnlocked(params.userId);
  await recordStarActivity({
    userId: params.userId,
    starProfileId: profile.id,
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
  starProfileId?: string;
  sourceKey: string;
  eventType: string;
  xp: number;
  stats?: Partial<StarStats>;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  if (params.xp <= 0) return false;
  const profileWhere = params.starProfileId
    ? and(
        eq(starProfilesTable.id, params.starProfileId),
        eq(starProfilesTable.userId, params.userId),
        isNotNull(starProfilesTable.equippedAt),
      )
    : and(eq(starProfilesTable.userId, params.userId), isNotNull(starProfilesTable.equippedAt));
  const [profile] = await db
    .select()
    .from(starProfilesTable)
    .where(profileWhere)
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
    const evolutionStage = computeEvolutionStage(afterLevel);
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

    const [stage] = locked.collectionId
      ? await tx.select({ imageUrl: nftEvolutionStagesTable.imageUrl })
        .from(nftEvolutionStagesTable)
        .where(and(
          eq(nftEvolutionStagesTable.collectionId, locked.collectionId),
          eq(nftEvolutionStagesTable.stageKey, evolutionStage),
          eq(nftEvolutionStagesTable.status, "published"),
          isNotNull(nftEvolutionStagesTable.imageUrl),
        ))
        .limit(1)
      : [];
    const originalImage = typeof locked.metadata?.nftImageUrl === "string"
      ? locked.metadata.nftImageUrl
      : locked.imageUrl;
    await tx
      .update(starProfilesTable)
      .set({
        xp: afterXp,
        level: afterLevel,
        currentEvolutionStage: evolutionStage,
        stats: nextStats,
        imageUrl: stage?.imageUrl ?? originalImage,
      })
      .where(eq(starProfilesTable.id, locked.id));

    const [characterProfile] = await tx
      .select({ id: characterProfilesTable.id })
      .from(characterProfilesTable)
      .where(eq(characterProfilesTable.id, locked.id))
      .for("update");
    if (characterProfile) {
      await tx
        .insert(characterGrowthEventsTable)
        .values({
          profileId: locked.id,
          ownerUserId: params.userId,
          sourceKey: `star:${params.sourceKey}`,
          eventType: params.eventType,
          xpDelta: params.xp,
          statChanges: cleanStats,
          beforeLevel,
          afterLevel,
          beforeXp,
          afterXp,
          metadata: params.metadata ?? {},
        })
        .onConflictDoNothing({ target: characterGrowthEventsTable.sourceKey });
      await tx
        .update(characterProfilesTable)
        .set({
          xp: afterXp,
          level: afterLevel,
          stats: {
            charm: nextStats.charm,
            stagePresence: nextStats.stagePresence,
            bond: nextStats.bond,
            lore: nextStats.lore,
          },
          profileImageUrl: stage?.imageUrl ?? originalImage,
        })
        .where(eq(characterProfilesTable.id, locked.id));
    }
    granted = true;
  });

  return granted;
}
