import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import {
  DEFAULT_STAR_STATS,
  db,
  starGrowthEventsTable,
  starProfilesTable,
  type StarStats,
} from "@workspace/db";
import { getEquippedStarProfile, recordStarActivity, type StarProfileView } from "./starProfiles";

export const TORIMIA_REQUIRED_LEVEL = 3;
export const TORIMIA_REQUIRED_COMPLETED_MISSIONS = 3;
export const TORIMIA_REQUIRED_STAT_VALUE = 2;

type TorimiaRequirementKey = "level" | "missions" | "charm" | "stagePresence" | "bond" | "lore";

export interface TorimiaRequirement {
  key: TorimiaRequirementKey;
  label: string;
  current: number;
  target: number;
  met: boolean;
}

export interface TorimiaState {
  star: StarProfileView | null;
  opened: boolean;
  promoted: boolean;
  canOpen: boolean;
  requirements: TorimiaRequirement[];
}

export class TorimiaError extends Error {
  constructor(readonly code: "star_required" | "not_ready", message: string, readonly state: TorimiaState) {
    super(message);
  }
}

async function completedMissionCount(starProfileId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(starGrowthEventsTable)
    .where(
      and(
        eq(starGrowthEventsTable.starProfileId, starProfileId),
        eq(starGrowthEventsTable.eventType, "star_mission_complete"),
      ),
    );
  return Number(row?.value ?? 0);
}

function buildRequirements(star: StarProfileView, missions: number): TorimiaRequirement[] {
  const stats: StarStats = { ...DEFAULT_STAR_STATS, ...star.stats };
  return [
    {
      key: "level",
      label: "STAR 레벨",
      current: star.level,
      target: TORIMIA_REQUIRED_LEVEL,
      met: star.level >= TORIMIA_REQUIRED_LEVEL,
    },
    {
      key: "missions",
      label: "STAR 미션 완료",
      current: missions,
      target: TORIMIA_REQUIRED_COMPLETED_MISSIONS,
      met: missions >= TORIMIA_REQUIRED_COMPLETED_MISSIONS,
    },
    ...(["charm", "stagePresence", "bond", "lore"] as const).map((key) => ({
      key,
      label:
        key === "charm"
          ? "매력"
          : key === "stagePresence"
            ? "무대감"
            : key === "bond"
              ? "팬 유대"
              : "서사",
      current: stats[key] ?? 0,
      target: TORIMIA_REQUIRED_STAT_VALUE,
      met: (stats[key] ?? 0) >= TORIMIA_REQUIRED_STAT_VALUE,
    })),
  ];
}

export async function getTorimiaState(userId: string): Promise<TorimiaState> {
  const star = await getEquippedStarProfile(userId);
  if (!star) {
    return { star: null, opened: false, promoted: false, canOpen: false, requirements: [] };
  }

  const missions = await completedMissionCount(star.id);
  const requirements = buildRequirements(star, missions);
  const promoted = star.stage === "promoted";
  return {
    star,
    opened: promoted || star.torimiaOpenedAt != null,
    promoted,
    canOpen: !promoted && requirements.every((item) => item.met),
    requirements,
  };
}

export async function openTorimia(userId: string): Promise<TorimiaState> {
  const state = await getTorimiaState(userId);
  if (!state.star) {
    throw new TorimiaError("star_required", "먼저 STAR NFT를 장착해 주세요.", state);
  }
  if (state.promoted) return state;
  if (!state.canOpen) {
    throw new TorimiaError("not_ready", "아직 토르미아의 문을 열 조건이 부족해요.", state);
  }

  const now = new Date();
  const [updated] = await db
    .update(starProfilesTable)
    .set({
      stage: "promoted",
      torimiaOpenedAt: sql`coalesce(${starProfilesTable.torimiaOpenedAt}, ${now})`,
      promotedAt: sql`coalesce(${starProfilesTable.promotedAt}, ${now})`,
      updatedAt: now,
    })
    .where(
      and(
        eq(starProfilesTable.id, state.star.id),
        eq(starProfilesTable.userId, userId),
        isNotNull(starProfilesTable.equippedAt),
      ),
    )
    .returning();

  if (!updated) {
    throw new TorimiaError("star_required", "장착된 STAR를 다시 확인해 주세요.", state);
  }

  await recordStarActivity({
    userId,
    starProfileId: updated.id,
    sourceKey: `torimia_open:${updated.id}:${userId}`,
    eventType: "torimia_open",
    xp: 50,
    stats: { charm: 2, stagePresence: 2, bond: 2, lore: 2 },
    reason: "토르미아의 문 개방",
    metadata: { starProfileId: updated.id },
  });

  return getTorimiaState(userId);
}
