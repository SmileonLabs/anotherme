import { count, eq } from "drizzle-orm";
import {
  db,
  fanProfilesTable,
  userPlayModesTable,
  type FanProfile,
  type PlayMode,
  type UserPlayMode,
  starProfileFollowsTable,
  starProfilesTable,
} from "@workspace/db";
import { listStarProfiles, type StarProfileView } from "./starProfiles";

export interface PlayModeState {
  currentMode: PlayMode;
  starUnlocked: boolean;
  fanProfile: {
    level: number;
    xp: number;
    stats: FanProfile["stats"];
  };
  social: {
    followerCount: number;
    followingCount: number;
  };
  equippedStar: StarProfileView | null;
  starProfiles: StarProfileView[];
}

function normalizeMode(value: string | null | undefined): PlayMode {
  return value === "star" ? "star" : "fan";
}

async function serialize(mode: UserPlayMode, fanProfile: FanProfile): Promise<PlayModeState> {
  const starProfiles = await listStarProfiles(mode.userId);
  const [followers] = await db
    .select({ value: count() })
    .from(starProfileFollowsTable)
    .innerJoin(starProfilesTable, eq(starProfilesTable.id, starProfileFollowsTable.starProfileId))
    .where(eq(starProfilesTable.userId, mode.userId));
  const [following] = await db
    .select({ value: count() })
    .from(starProfileFollowsTable)
    .where(eq(starProfileFollowsTable.followerUserId, mode.userId));
  const equippedStar = starProfiles.find((profile) => profile.equippedAt !== null) ?? null;
  const starUnlocked = starProfiles.length > 0;
  const currentMode = starUnlocked ? normalizeMode(mode.currentMode) : "fan";
  return {
    currentMode,
    starUnlocked,
    fanProfile: {
      level: fanProfile.level,
      xp: fanProfile.xp,
      stats: fanProfile.stats,
    },
    social: {
      followerCount: Number(followers?.value ?? 0),
      followingCount: Number(following?.value ?? 0),
    },
    equippedStar,
    starProfiles,
  };
}

export async function ensurePlayModeState(userId: string): Promise<PlayModeState> {
  await db.insert(fanProfilesTable).values({ userId }).onConflictDoNothing();
  await db.insert(userPlayModesTable).values({ userId }).onConflictDoNothing();

  const [fanProfile] = await db
    .select()
    .from(fanProfilesTable)
    .where(eq(fanProfilesTable.userId, userId));
  let [mode] = await db
    .select()
    .from(userPlayModesTable)
    .where(eq(userPlayModesTable.userId, userId));

  if (!fanProfile || !mode) throw new Error("Failed to initialize play mode state");

  const state = await serialize(mode, fanProfile);
  if (
    (mode.currentMode === "star" && !state.starUnlocked) ||
    mode.starUnlocked !== state.starUnlocked
  ) {
    [mode] = await db
      .update(userPlayModesTable)
      .set({ currentMode: state.starUnlocked ? mode.currentMode : "fan", starUnlocked: state.starUnlocked })
      .where(eq(userPlayModesTable.userId, userId))
      .returning();
  }

  return serialize(mode, fanProfile);
}

export async function setPlayMode(userId: string, nextMode: PlayMode): Promise<PlayModeState> {
  const state = await ensurePlayModeState(userId);
  if (nextMode === "star" && !state.starUnlocked) {
    const err = new Error("STAR mode is locked");
    (err as Error & { code?: string }).code = "STAR_LOCKED";
    throw err;
  }

  await db
    .update(userPlayModesTable)
    .set({ currentMode: nextMode })
    .where(eq(userPlayModesTable.userId, userId));

  return ensurePlayModeState(userId);
}
