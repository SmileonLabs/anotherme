import { eq, sql } from "drizzle-orm";
import type { Logger } from "pino";
import { db } from "@workspace/db";
import {
  DEFAULT_PERSONA_STATS,
  clanMembersTable,
  clansTable,
  personasTable,
  type PersonaStats,
} from "@workspace/db";
import { computeLevel } from "./growth";
import type { GrowthKind } from "./growth";
import { computeIdentity, STAT_LABEL } from "./personaIdentity";
import { logger as defaultLogger } from "./logger";
import { CLAN_ARCHETYPE_KEYS } from "./clan";

/** Share of an individual EXP gain that flows up to the member's clan. */
export const CLAN_BASE_RATE = 0.3;

/** Flat clan-EXP bonuses for specific milestone events (added on top of base). */
export const CLAN_KIND_BONUS: Partial<Record<GrowthKind, number>> = {
  battle_win: 20,
  dungeon_goal: 30,
};

/** Clan-EXP bonus for entering the overall ranking Top 10 (once per UTC day). */
export const CLAN_RANK_TOP10_BONUS = 50;
export const CLAN_RANK_TOP10_THRESHOLD = 10;

/** EXP to go from level L to L+1 is `L * 1000`. */
export const CLAN_LEVEL_STEP = 1000;

/**
 * Cumulative clan EXP required to *reach* a level. Reaching L needs the sum of
 * each prior step, i.e. `1000 * (L-1) * L / 2` (L1→2: 1000, 2→3: 2000, ...).
 */
export function clanXpToReachLevel(level: number): number {
  if (level <= 1) return 0;
  return (CLAN_LEVEL_STEP * (level - 1) * level) / 2;
}

/** The clan level for a given cumulative EXP total. */
export function computeClanLevel(exp: number): number {
  let level = 1;
  while (exp >= clanXpToReachLevel(level + 1)) level++;
  return level;
}

export interface ClanLevelProgress {
  level: number;
  exp: number;
  expIntoLevel: number;
  expForNextLevel: number;
}

export function clanLevelProgress(exp: number): ClanLevelProgress {
  const level = computeClanLevel(exp);
  const floor = clanXpToReachLevel(level);
  const ceil = clanXpToReachLevel(level + 1);
  return {
    level,
    exp,
    expIntoLevel: exp - floor,
    expForNextLevel: ceil - floor,
  };
}

/** The clan-EXP delta a growth event contributes: 30% of the XP + a flat bonus. */
export function clanExpForGrowth(kind: GrowthKind, individualXp: number): number {
  return Math.round(individualXp * CLAN_BASE_RATE) + (CLAN_KIND_BONUS[kind] ?? 0);
}

/**
 * Apply an EXP delta to a clan (and the contributing member) atomically. The clan
 * row is locked so its level is recomputed from a consistent EXP, and the member's
 * contributionExp accrues the same delta. Assumes `delta > 0`.
 */
async function applyClanExp(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  clanId: string,
  membershipId: string,
  delta: number,
): Promise<void> {
  const [clan] = await tx
    .select({ exp: clansTable.exp })
    .from(clansTable)
    .where(eq(clansTable.id, clanId))
    .for("update");
  if (!clan) return;

  const newExp = clan.exp + delta;
  const newLevel = computeClanLevel(newExp);

  await tx
    .update(clansTable)
    .set({ exp: newExp, level: newLevel })
    .where(eq(clansTable.id, clanId));

  await tx
    .update(clanMembersTable)
    .set({ contributionExp: sql`${clanMembersTable.contributionExp} + ${delta}` })
    .where(eq(clanMembersTable.id, membershipId));
}

/**
 * Award clan EXP for a user's contribution, in its OWN transaction. Designed to be
 * called fire-and-forget *after* the individual persona update has committed, so a
 * clan-side failure can never roll back or block individual XP. No-ops when the
 * user has no clan or the delta is non-positive.
 */
export async function awardClanExp(
  userId: string,
  delta: number,
  log: Logger = defaultLogger,
): Promise<void> {
  if (delta <= 0) return;
  try {
    await db.transaction(async (tx) => {
      const [member] = await tx
        .select({ id: clanMembersTable.id, clanId: clanMembersTable.clanId })
        .from(clanMembersTable)
        .where(eq(clanMembersTable.userId, userId));
      if (!member) return;
      await applyClanExp(tx, member.clanId, member.id, delta);
    });
  } catch (err) {
    log.error({ err, userId, delta }, "awardClanExp failed");
  }
}

/**
 * Award the once-per-day ranking Top-10 clan bonus to a user, in its own
 * transaction. Idempotent per UTC day via `clan_members.lastRankBonusOn`. Returns
 * true only when a bonus was actually granted. Never throws.
 */
export async function awardClanRankTop10Bonus(
  userId: string,
  log: Logger = defaultLogger,
): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    return await db.transaction(async (tx) => {
      const [member] = await tx
        .select({
          id: clanMembersTable.id,
          clanId: clanMembersTable.clanId,
          lastRankBonusOn: clanMembersTable.lastRankBonusOn,
        })
        .from(clanMembersTable)
        .where(eq(clanMembersTable.userId, userId))
        .for("update");
      if (!member) return false;
      if (member.lastRankBonusOn === today) return false;

      await applyClanExp(tx, member.clanId, member.id, CLAN_RANK_TOP10_BONUS);
      await tx
        .update(clanMembersTable)
        .set({ lastRankBonusOn: today })
        .where(eq(clanMembersTable.id, member.id));
      return true;
    });
  } catch (err) {
    log.error({ err, userId }, "awardClanRankTop10Bonus failed");
    return false;
  }
}

type StatKey = keyof PersonaStats;
const STAT_ORDER: StatKey[] = [
  "logic",
  "empathy",
  "wit",
  "knowledge",
  "conviction",
  "emotion",
  "decisiveness",
];

/**
 * The clan's collective identity, derived read-only from its members' personas.
 * `clanPower` mirrors the ranking overall-score formula summed across members.
 */
export interface ClanIdentityView {
  clanId: string;
  level: number;
  exp: number;
  expIntoLevel: number;
  expForNextLevel: number;
  memberCount: number;
  averageLevel: number;
  clanPower: number;
  dominantArchetype: string;
  dominantArchetypeLabel: string;
  topStrengths: string[];
}

/** The read-only collective metrics shared by clan identity and clan ranking. */
export interface ClanMetrics {
  clanPower: number;
  averageLevel: number;
  dominantArchetype: string;
  dominantArchetypeLabel: string;
  topStrengths: string[];
}

/**
 * Derive a clan's collective metrics from its members' persona xp/stats. Pure and
 * read-only: it computes level/archetype in-process (computeLevel + computeIdentity,
 * no AI, no DB, no mutation). `clanPower` mirrors the ranking overall-score formula
 * summed across members. Shared by `getClanIdentity` and the clan-ranking service so
 * both stay consistent.
 */
export function computeClanMetrics(
  members: { xp: number | null; stats: PersonaStats | null }[],
): ClanMetrics {
  const memberCount = members.length;
  const archetypeCounts = new Map<string, number>();
  const statTotals: Record<StatKey, number> = { ...DEFAULT_PERSONA_STATS };
  let totalLevel = 0;
  let clanPower = 0;

  for (const r of members) {
    const stats: PersonaStats = { ...DEFAULT_PERSONA_STATS, ...(r.stats ?? {}) };
    const xp = r.xp ?? 0;
    const level = computeLevel(xp);
    const identity = computeIdentity(stats);
    const statSum = STAT_ORDER.reduce((a, k) => a + (stats[k] ?? 0), 0);

    totalLevel += level;
    clanPower += level * 1000 + xp + statSum * 10;
    archetypeCounts.set(
      identity.archetypeKey,
      (archetypeCounts.get(identity.archetypeKey) ?? 0) + 1,
    );
    for (const k of STAT_ORDER) statTotals[k] += stats[k] ?? 0;
  }

  // Dominant archetype: highest member count, tie-broken by fixed archetype order.
  let dominantArchetype = "observer";
  let bestCount = -1;
  for (const key of CLAN_ARCHETYPE_KEYS) {
    const count = archetypeCounts.get(key) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      dominantArchetype = key;
    }
  }

  // Top strengths: the clan's strongest aggregate stats (descending, with points).
  const topStrengths = STAT_ORDER.map((k) => ({ k, v: statTotals[k] }))
    .sort((a, b) => b.v - a.v)
    .filter((s) => s.v > 0)
    .slice(0, 3)
    .map((s) => STAT_LABEL[s.k]);

  return {
    clanPower,
    averageLevel: memberCount ? Math.round(totalLevel / memberCount) : 0,
    dominantArchetype,
    dominantArchetypeLabel: archetypeLabelOf(dominantArchetype),
    topStrengths,
  };
}

/**
 * Compute a clan's collective identity. Read-only: reads members' persona xp/stats
 * and derives level/archetype in-process (computeLevel + computeIdentity, no AI,
 * no mutation). Never exposes any per-member PII. Returns null if the clan is gone.
 */
export async function getClanIdentity(clanId: string): Promise<ClanIdentityView | null> {
  const [clan] = await db
    .select({ id: clansTable.id, exp: clansTable.exp })
    .from(clansTable)
    .where(eq(clansTable.id, clanId));
  if (!clan) return null;

  const rows = await db
    .select({ xp: personasTable.xp, stats: personasTable.stats })
    .from(clanMembersTable)
    .leftJoin(personasTable, eq(personasTable.userId, clanMembersTable.userId))
    .where(eq(clanMembersTable.clanId, clanId));

  const metrics = computeClanMetrics(rows);
  const progress = clanLevelProgress(clan.exp);

  return {
    clanId,
    level: progress.level,
    exp: progress.exp,
    expIntoLevel: progress.expIntoLevel,
    expForNextLevel: progress.expForNextLevel,
    memberCount: rows.length,
    averageLevel: metrics.averageLevel,
    clanPower: metrics.clanPower,
    dominantArchetype: metrics.dominantArchetype,
    dominantArchetypeLabel: metrics.dominantArchetypeLabel,
    topStrengths: metrics.topStrengths,
  };
}

/** Korean display label for an archetype key (matches computeIdentity naming). */
function archetypeLabelOf(key: string): string {
  return ARCHETYPE_LABELS[key] ?? "관찰자형";
}

const ARCHETYPE_LABELS: Record<string, string> = {
  strategist: "전략가형",
  harmonizer: "조율자형",
  explorer: "탐험가형",
  pioneer: "개척자형",
  sage: "현자형",
  entertainer: "재담꾼형",
  activist: "행동가형",
  observer: "관찰자형",
};
