import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import {
  activeCharacterProfilesTable,
  characterProfileFollowsTable,
  characterProfileNotificationsTable,
  characterProfilesTable,
  db,
  fanCharacterProfilesTable,
  fanProfilesTable,
  officialAiAccountsTable,
  officialAiCharacterProfilesTable,
  starCharacterProfilesTable,
  starProfilesTable,
  userPlayModesTable,
  usersTable,
  type CharacterProfile,
  type CharacterProfileType,
} from "@workspace/db";
import {
  canArchiveCharacterProfile,
  canCreateAdditionalFan,
  normalizeProfileHandle,
} from "./characterProfilePolicy";

export interface CharacterProfileView {
  id: string;
  type: CharacterProfileType;
  handle: string;
  displayName: string;
  profileImageUrl: string | null;
  statusMessage: string | null;
  status: CharacterProfile["status"];
  level: number;
  xp: number;
  jobKey: string | null;
  jobStage: number;
  stats: Record<string, number>;
  metadata: Record<string, unknown>;
  isActive: boolean;
}

export interface CharacterProfileState {
  activeProfile: CharacterProfileView;
  profiles: CharacterProfileView[];
}

function fanHandle(userId: string): string {
  return `fan-${userId.replaceAll("-", "")}`;
}

function starHandle(profileId: string): string {
  return `star-${profileId.replaceAll("-", "")}`;
}

async function ensureLegacyProfileRows(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(fanProfilesTable).values({ userId }).onConflictDoNothing();
    await tx.insert(userPlayModesTable).values({ userId }).onConflictDoNothing();

    const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) throw new Error("User not found while initializing profiles");

    const [legacyFan] = await tx
      .select()
      .from(fanProfilesTable)
      .where(eq(fanProfilesTable.userId, userId));
    if (!legacyFan) throw new Error("Fan profile initialization failed");

    let [fanProfile] = await tx
      .select()
      .from(characterProfilesTable)
      .where(
        and(
          eq(characterProfilesTable.ownerUserId, userId),
          eq(characterProfilesTable.type, "fan"),
          isNull(characterProfilesTable.archivedAt),
        ),
      )
      .orderBy(asc(characterProfilesTable.createdAt))
      .limit(1);

    if (!fanProfile) {
      [fanProfile] = await tx
        .insert(characterProfilesTable)
        .values({
          ownerUserId: userId,
          type: "fan",
          handle: fanHandle(userId),
          displayName: user.nickname,
          profileImageUrl: user.profileImageUrl,
          statusMessage: user.statusMessage,
          level: legacyFan.level,
          xp: legacyFan.xp,
          stats: {
            fanPower: legacyFan.stats.fanPower,
            supportPower: legacyFan.stats.supportPower,
            empathy: legacyFan.stats.empathy,
            story: legacyFan.stats.story,
          },
        })
        .onConflictDoNothing({ target: characterProfilesTable.handle })
        .returning();
      if (!fanProfile) {
        [fanProfile] = await tx
          .select()
          .from(characterProfilesTable)
          .where(eq(characterProfilesTable.handle, fanHandle(userId)));
      }
    }
    if (!fanProfile) throw new Error("Character FAN profile initialization failed");

    await tx
      .insert(fanCharacterProfilesTable)
      .values({ profileId: fanProfile.id, legacyFanUserId: userId })
      .onConflictDoNothing();

    const legacyStars = await tx
      .select()
      .from(starProfilesTable)
      .where(eq(starProfilesTable.userId, userId))
      .orderBy(asc(starProfilesTable.createdAt));

    for (const star of legacyStars) {
      await tx
        .insert(characterProfilesTable)
        .values({
          id: star.id,
          ownerUserId: userId,
          type: "star",
          handle: starHandle(star.id),
          displayName: star.displayName,
          profileImageUrl: star.imageUrl,
          status: star.ownershipStatus === "verified" ? "active" : "locked",
          level: star.level,
          xp: star.xp,
          stats: {
            charm: star.stats.charm,
            stagePresence: star.stats.stagePresence,
            bond: star.stats.bond,
            lore: star.stats.lore,
          },
          metadata: {
            category: star.category,
            starKey: star.starKey,
            collectionId: star.collectionId,
          },
          createdAt: star.createdAt,
          updatedAt: star.updatedAt,
        })
        .onConflictDoNothing({ target: characterProfilesTable.id });
      await tx
        .update(characterProfilesTable)
        .set({
          status: star.ownershipStatus === "verified" ? "active" : "locked",
          level: star.level,
          xp: star.xp,
          stats: {
            charm: star.stats.charm,
            stagePresence: star.stats.stagePresence,
            bond: star.stats.bond,
            lore: star.stats.lore,
          },
          metadata: {
            category: star.category,
            starKey: star.starKey,
            collectionId: star.collectionId,
          },
        })
        .where(
          and(
            eq(characterProfilesTable.id, star.id),
            eq(characterProfilesTable.ownerUserId, userId),
            eq(characterProfilesTable.type, "star"),
          ),
        );
      await tx
        .insert(starCharacterProfilesTable)
        .values({ profileId: star.id, starProfileId: star.id })
        .onConflictDoNothing();
    }

    const officialAccounts = await tx
      .select()
      .from(officialAiAccountsTable)
      .where(eq(officialAiAccountsTable.officialUserId, userId));
    for (const account of officialAccounts) {
      await tx
        .insert(characterProfilesTable)
        .values({
          id: account.id,
          ownerUserId: userId,
          type: "official_ai",
          handle: `official-${account.slug}`,
          displayName: account.displayName,
          profileImageUrl: account.profileImageUrl,
          statusMessage: account.description,
          status: account.status === "published" ? "active" : account.status === "archived" ? "archived" : "locked",
          metadata: { accountKind: account.accountKind, ipProfileId: account.ipProfileId },
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        })
        .onConflictDoNothing({ target: characterProfilesTable.id });
      await tx
        .insert(officialAiCharacterProfilesTable)
        .values({ profileId: account.id, officialAiAccountId: account.id })
        .onConflictDoNothing();
    }

    const [selection] = await tx
      .select()
      .from(activeCharacterProfilesTable)
      .where(eq(activeCharacterProfilesTable.userId, userId));
    if (!selection) {
      const equipped = legacyStars
        .filter((profile) => profile.equippedAt !== null)
        .sort((a, b) => (b.equippedAt?.getTime() ?? 0) - (a.equippedAt?.getTime() ?? 0))[0];
      const [mode] = await tx
        .select()
        .from(userPlayModesTable)
        .where(eq(userPlayModesTable.userId, userId));
      const activeProfileId = mode?.currentMode === "star" && equipped ? equipped.id : fanProfile.id;
      await tx.insert(activeCharacterProfilesTable).values({
        userId,
        activeProfileId,
        lastFanProfileId: fanProfile.id,
        lastStarProfileId: equipped?.id,
      });
    }
  });
}

async function readCharacterProfileState(userId: string): Promise<CharacterProfileState> {
  const [selection] = await db
    .select()
    .from(activeCharacterProfilesTable)
    .where(eq(activeCharacterProfilesTable.userId, userId));
  const profiles = await db
    .select()
    .from(characterProfilesTable)
    .where(
      and(
        eq(characterProfilesTable.ownerUserId, userId),
        isNull(characterProfilesTable.archivedAt),
      ),
    )
    .orderBy(asc(characterProfilesTable.type), desc(characterProfilesTable.updatedAt));
  if (!selection || profiles.length === 0) throw new Error("Character profile state is unavailable");

  const views = profiles.map<CharacterProfileView>((profile) => ({
    id: profile.id,
    type: profile.type,
    handle: profile.handle,
    displayName: profile.displayName,
    profileImageUrl: profile.profileImageUrl,
    statusMessage: profile.statusMessage,
    status: profile.status,
    level: profile.level,
    xp: profile.xp,
    jobKey: profile.jobKey,
    jobStage: profile.jobStage,
    stats: profile.stats,
    metadata: profile.metadata,
    isActive: profile.id === selection.activeProfileId,
  }));
  const activeProfile = views.find((profile) => profile.isActive);
  if (!activeProfile) throw new Error("Active character profile does not belong to the user");
  return { activeProfile, profiles: views };
}

export async function ensureCharacterProfileState(userId: string): Promise<CharacterProfileState> {
  await ensureLegacyProfileRows(userId);
  return readCharacterProfileState(userId);
}

export async function resolveCharacterProfileActor(
  userId: string,
  requestedProfileId?: string | null,
): Promise<CharacterProfileView> {
  const state = await ensureCharacterProfileState(userId);
  if (!requestedProfileId) return state.activeProfile;
  const profile = state.profiles.find((candidate) => candidate.id === requestedProfileId);
  if (!profile) {
    const error = new Error("Profile does not belong to authenticated user");
    (error as Error & { code?: string }).code = "PROFILE_NOT_OWNED";
    throw error;
  }
  if (profile.status !== "active") {
    const error = new Error("Profile is unavailable");
    (error as Error & { code?: string }).code = "PROFILE_UNAVAILABLE";
    throw error;
  }
  return profile;
}

export async function createFanCharacterProfile(
  userId: string,
  input: {
    displayName: string;
    handle?: string;
    profileImageUrl?: string | null;
    customization: Record<string, unknown>;
  },
): Promise<CharacterProfileState> {
  await ensureLegacyProfileRows(userId);
  const state = await readCharacterProfileState(userId);
  const fanProfiles = state.profiles.filter((profile) => profile.type === "fan");
  const fanDetails = await db
    .select()
    .from(fanCharacterProfilesTable)
    .where(eq(fanCharacterProfilesTable.profileId, fanProfiles[0]?.id ?? randomUUID()));
  const firstFanIsUncustomized = fanProfiles.length === 1
    && fanDetails.length === 1
    && Object.keys(fanDetails[0]!.customization).length === 0;

  if (!firstFanIsUncustomized && !canCreateAdditionalFan(fanProfiles)) {
    const error = new Error("An existing FAN must reach Torimia before another FAN can be created");
    (error as Error & { code?: string }).code = "FAN_EXPANSION_LOCKED";
    throw error;
  }

  if (firstFanIsUncustomized) {
    const profile = fanProfiles[0]!;
    await db.transaction(async (tx) => {
      await tx.update(characterProfilesTable).set({
        displayName: input.displayName,
        profileImageUrl: input.profileImageUrl ?? profile.profileImageUrl,
        metadata: { ...profile.metadata, onboardingCustomized: true },
        updatedAt: new Date(),
      }).where(eq(characterProfilesTable.id, profile.id));
      await tx.update(fanCharacterProfilesTable).set({ customization: input.customization })
        .where(eq(fanCharacterProfilesTable.profileId, profile.id));
    });
    return activateCharacterProfile(userId, profile.id);
  }

  const generation = fanProfiles.length + 1;
  const requestedHandle = input.handle ? normalizeProfileHandle(input.handle) : "";
  const handle = requestedHandle || `fan-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const [created] = await db.transaction(async (tx) => {
    const rows = await tx.insert(characterProfilesTable).values({
      ownerUserId: userId,
      type: "fan",
      handle,
      displayName: input.displayName,
      profileImageUrl: input.profileImageUrl ?? null,
      stats: { charm: 0, supportPower: 0, bond: 0, influence: 0 },
      metadata: { onboardingCustomized: true, generation },
    }).returning();
    const profile = rows[0];
    if (!profile) throw new Error("FAN profile creation failed");
    await tx.insert(fanCharacterProfilesTable).values({
      profileId: profile.id,
      legacyFanUserId: null,
      generation,
      customization: input.customization,
    });
    return rows;
  });
  if (!created) throw new Error("FAN profile creation failed");
  return activateCharacterProfile(userId, created.id);
}

export async function archiveCharacterProfile(
  userId: string,
  profileId: string,
): Promise<CharacterProfileState> {
  await ensureLegacyProfileRows(userId);
  const state = await readCharacterProfileState(userId);
  const target = state.profiles.find((profile) => profile.id === profileId);
  if (!target) {
    const error = new Error("Profile not found");
    (error as Error & { code?: string }).code = "PROFILE_NOT_FOUND";
    throw error;
  }
  if (!canArchiveCharacterProfile(state.profiles.length)) {
    const error = new Error("The last character profile cannot be archived");
    (error as Error & { code?: string }).code = "LAST_PROFILE_REQUIRED";
    throw error;
  }
  const replacement = state.profiles.find((profile) => profile.id !== profileId && profile.status === "active");
  if (!replacement) {
    const error = new Error("No active replacement profile is available");
    (error as Error & { code?: string }).code = "REPLACEMENT_PROFILE_REQUIRED";
    throw error;
  }
  await db.transaction(async (tx) => {
    await tx.update(characterProfilesTable).set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(characterProfilesTable.id, profileId), eq(characterProfilesTable.ownerUserId, userId)));
    if (target.isActive) {
      await tx.update(activeCharacterProfilesTable).set({ activeProfileId: replacement.id, updatedAt: new Date() })
        .where(eq(activeCharacterProfilesTable.userId, userId));
    }
  });
  return readCharacterProfileState(userId);
}

export async function activateCharacterProfile(
  userId: string,
  profileId: string,
): Promise<CharacterProfileState> {
  await ensureLegacyProfileRows(userId);
  await db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(characterProfilesTable)
      .where(
        and(
          eq(characterProfilesTable.id, profileId),
          eq(characterProfilesTable.ownerUserId, userId),
          isNull(characterProfilesTable.archivedAt),
        ),
      );
    if (!profile) {
      const error = new Error("Profile not found");
      (error as Error & { code?: string }).code = "PROFILE_NOT_FOUND";
      throw error;
    }
    if (profile.status !== "active") {
      const error = new Error("Profile is not active");
      (error as Error & { code?: string }).code = "PROFILE_UNAVAILABLE";
      throw error;
    }

    await tx
      .insert(activeCharacterProfilesTable)
      .values({
        userId,
        activeProfileId: profile.id,
        lastFanProfileId: profile.type === "fan" ? profile.id : undefined,
        lastStarProfileId: profile.type === "star" ? profile.id : undefined,
      })
      .onConflictDoUpdate({
        target: activeCharacterProfilesTable.userId,
        set: {
          activeProfileId: profile.id,
          ...(profile.type === "fan" ? { lastFanProfileId: profile.id } : {}),
          ...(profile.type === "star" ? { lastStarProfileId: profile.id } : {}),
          updatedAt: new Date(),
        },
      });

    await tx
      .update(userPlayModesTable)
      .set({ currentMode: profile.type === "star" ? "star" : "fan" })
      .where(eq(userPlayModesTable.userId, userId));
    if (profile.type === "star") {
      await tx
        .update(starProfilesTable)
        .set({ equippedAt: null })
        .where(eq(starProfilesTable.userId, userId));
      await tx
        .update(starProfilesTable)
        .set({ equippedAt: new Date() })
        .where(and(eq(starProfilesTable.id, profile.id), eq(starProfilesTable.userId, userId)));
    }
  });
  return readCharacterProfileState(userId);
}

export async function updateCharacterProfile(
  userId: string,
  profileId: string,
  changes: { displayName?: string; profileImageUrl?: string | null; statusMessage?: string | null },
): Promise<CharacterProfileState> {
  await ensureLegacyProfileRows(userId);
  const [updated] = await db
    .update(characterProfilesTable)
    .set({ ...changes, updatedAt: new Date() })
    .where(
      and(
        eq(characterProfilesTable.id, profileId),
        eq(characterProfilesTable.ownerUserId, userId),
        isNull(characterProfilesTable.archivedAt),
      ),
    )
    .returning({ id: characterProfilesTable.id });
  if (!updated) {
    const error = new Error("Profile not found");
    (error as Error & { code?: string }).code = "PROFILE_NOT_FOUND";
    throw error;
  }
  return readCharacterProfileState(userId);
}

export async function getPublicCharacterProfile(viewerUserId: string, profileId: string) {
  const [profile] = await db
    .select()
    .from(characterProfilesTable)
    .where(and(eq(characterProfilesTable.id, profileId), isNull(characterProfilesTable.archivedAt)))
    .limit(1);
  if (!profile || (profile.status !== "active" && profile.ownerUserId !== viewerUserId)) return null;
  const viewerProfileId = (await ensureCharacterProfileState(viewerUserId)).activeProfile.id;
  const [[followers], [following], [followedByMe]] = await Promise.all([
    db.select({ value: count() }).from(characterProfileFollowsTable).where(eq(characterProfileFollowsTable.followedProfileId, profileId)),
    db.select({ value: count() }).from(characterProfileFollowsTable).where(eq(characterProfileFollowsTable.followerProfileId, profileId)),
    db.select({ value: count() }).from(characterProfileFollowsTable).where(and(eq(characterProfileFollowsTable.followerProfileId, viewerProfileId), eq(characterProfileFollowsTable.followedProfileId, profileId))),
  ]);
  return {
    id: profile.id,
    type: profile.type,
    handle: profile.handle,
    displayName: profile.displayName,
    profileImageUrl: profile.profileImageUrl,
    statusMessage: profile.statusMessage,
    level: profile.level,
    xp: profile.xp,
    stats: profile.stats,
    metadata: profile.metadata,
    isMine: profile.ownerUserId === viewerUserId,
    followedByMe: Number(followedByMe?.value ?? 0) > 0,
    followerCount: Number(followers?.value ?? 0),
    followingCount: Number(following?.value ?? 0),
    ownerUserId: profile.ownerUserId,
  };
}

export async function setCharacterProfileFollowing(
  viewerUserId: string,
  targetProfileId: string,
  following: boolean,
) {
  const target = await getPublicCharacterProfile(viewerUserId, targetProfileId);
  if (!target) return null;
  if (target.isMine) {
    const error = new Error("Cannot follow an owned profile");
    (error as Error & { code?: string }).code = "OWN_PROFILE";
    throw error;
  }
  const viewerProfileId = (await ensureCharacterProfileState(viewerUserId)).activeProfile.id;
  if (following) {
    const inserted = await db.insert(characterProfileFollowsTable).values({ followerProfileId: viewerProfileId, followedProfileId: targetProfileId }).onConflictDoNothing().returning({ followerProfileId: characterProfileFollowsTable.followerProfileId });
    if (inserted.length > 0) {
      await db.insert(characterProfileNotificationsTable).values({
        profileId: targetProfileId,
        actorProfileId: viewerProfileId,
        type: "profile.followed",
        data: {},
      });
    }
  } else {
    await db.delete(characterProfileFollowsTable).where(and(eq(characterProfileFollowsTable.followerProfileId, viewerProfileId), eq(characterProfileFollowsTable.followedProfileId, targetProfileId)));
  }
  return { following };
}
