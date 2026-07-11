import { eq } from "drizzle-orm";
import {
  db,
  fanProfilesTable,
  userPlayModesTable,
  type FanProfile,
  type PlayMode,
  type UserPlayMode,
} from "@workspace/db";
import { getEquippedStarProfile, type StarProfileView } from "./starProfiles";

export interface PlayModeState {
  currentMode: PlayMode;
  starUnlocked: boolean;
  fanProfile: {
    level: number;
    xp: number;
    stats: FanProfile["stats"];
  };
  equippedStar: StarProfileView | null;
}

function normalizeMode(value: string | null | undefined): PlayMode {
  return value === "star" ? "star" : "fan";
}

async function serialize(mode: UserPlayMode, fanProfile: FanProfile): Promise<PlayModeState> {
  const starUnlocked = Boolean(mode.starUnlocked);
  const currentMode = starUnlocked ? normalizeMode(mode.currentMode) : "fan";
  const equippedStar = starUnlocked ? await getEquippedStarProfile(mode.userId) : null;
  return {
    currentMode,
    starUnlocked,
    fanProfile: {
      level: fanProfile.level,
      xp: fanProfile.xp,
      stats: fanProfile.stats,
    },
    equippedStar,
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

  if (mode.currentMode === "star" && !mode.starUnlocked) {
    [mode] = await db
      .update(userPlayModesTable)
      .set({ currentMode: "fan" })
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
