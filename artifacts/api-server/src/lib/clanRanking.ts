import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  clanMembersTable,
  clansTable,
  personasTable,
  type PersonaStats,
} from "@workspace/db";
import { computeClanMetrics } from "./clanGrowth";
import { CLAN_ARCHETYPE_KEYS, type ClanArchetypeKey } from "./clan";

/** The clan ranking categories the API supports. */
export const CLAN_RANKING_TYPES = [
  "overall",
  "level",
  "contribution",
  "average_level",
  "archetype",
] as const;
export type ClanRankingType = (typeof CLAN_RANKING_TYPES)[number];

export const CLAN_RANKING_LIMIT_DEFAULT = 50;
export const CLAN_RANKING_LIMIT_MAX = 100;

/**
 * Max clans pulled into in-process identity computation per request. The candidate
 * set is ordered by cheap stored proxies (memberCount/level/exp) so the strongest
 * clans are always included; for the cheap rankings (level/contribution) the order
 * is exact. A future season/cache/aggregate table can replace this live path.
 */
const CLAN_RANKING_CANDIDATE_LIMIT = 500;

export interface ClanRankingItem {
  rank: number;
  clanId: string;
  name: string;
  emblemUrl: string | null;
  level: number;
  exp: number;
  memberCount: number;
  dominantArchetype: string;
  dominantArchetypeLabel: string;
  clanPower: number;
  averageLevel: number;
  topStrengths: string[];
  score: number;
}

export interface MyClanRank {
  rank: number;
  score: number;
  /** Score gap to the rank directly above (0 when already first). */
  pointsToNextRank: number;
}

export interface ClanRankingResult {
  type: ClanRankingType;
  archetype: ClanArchetypeKey | null;
  items: ClanRankingItem[];
  myClanRank: MyClanRank | null;
}

interface RankedClan {
  clanId: string;
  name: string;
  emblemUrl: string | null;
  level: number;
  exp: number;
  memberCount: number;
  clanPower: number;
  averageLevel: number;
  dominantArchetype: string;
  dominantArchetypeLabel: string;
  topStrengths: string[];
}

/** The metric that backs each ranking type (also the item's `score`). */
function scoreOf(c: RankedClan, type: ClanRankingType): number {
  switch (type) {
    case "level":
      return c.level;
    case "contribution":
      return c.exp;
    case "average_level":
      return c.averageLevel;
    case "overall":
    case "archetype":
    default:
      return c.clanPower;
  }
}

/**
 * Comparator per ranking type: primary metric desc, then the spec's tie-breaks,
 * finally clanId asc so the order is stable across calls.
 */
function makeComparator(type: ClanRankingType) {
  return (a: RankedClan, b: RankedClan): number => {
    switch (type) {
      case "level":
        if (b.level !== a.level) return b.level - a.level;
        if (b.exp !== a.exp) return b.exp - a.exp;
        break;
      case "contribution":
        if (b.exp !== a.exp) return b.exp - a.exp;
        if (b.level !== a.level) return b.level - a.level;
        break;
      case "average_level":
        if (b.averageLevel !== a.averageLevel) return b.averageLevel - a.averageLevel;
        if (b.clanPower !== a.clanPower) return b.clanPower - a.clanPower;
        break;
      case "overall":
      case "archetype":
      default:
        if (b.clanPower !== a.clanPower) return b.clanPower - a.clanPower;
        if (b.level !== a.level) return b.level - a.level;
        if (b.exp !== a.exp) return b.exp - a.exp;
        if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
        break;
    }
    return a.clanId < b.clanId ? -1 : a.clanId > b.clanId ? 1 : 0;
  };
}

/**
 * Compute a clan leaderboard. Read-only: it never mutates clans, members, personas,
 * XP, or clan EXP. Identity metrics (clanPower/averageLevel/archetype/strengths) are
 * derived in-process from members' personas via the shared `computeClanMetrics` (no
 * AI). Per-member PII is never selected or returned. The single service entry point
 * keeps the route thin and lets a future cache/aggregate layer wrap it.
 */
export async function getClanRankings(opts: {
  type: ClanRankingType;
  archetype?: ClanArchetypeKey | null;
  limit: number;
  meUserId: string;
}): Promise<ClanRankingResult> {
  const { type, meUserId } = opts;
  const limit = Math.min(CLAN_RANKING_LIMIT_MAX, Math.max(1, opts.limit));
  const archetype: ClanArchetypeKey | null =
    type === "archetype" ? opts.archetype ?? "strategist" : null;

  // Resolve the caller's clan up front so it can be force-included in the pool.
  const [myMembership] = await db
    .select({ clanId: clanMembersTable.clanId })
    .from(clanMembersTable)
    .where(eq(clanMembersTable.userId, meUserId));

  // Candidate ordering: for the cheap stored-metric rankings (level/contribution)
  // order by the true metric so the capped pool is exact; otherwise use a strength
  // proxy. A future season/cache/aggregate table can replace this live path.
  const candidateOrder =
    type === "level"
      ? [desc(clansTable.level), desc(clansTable.exp), desc(clansTable.memberCount)]
      : type === "contribution"
        ? [desc(clansTable.exp), desc(clansTable.level), desc(clansTable.memberCount)]
        : [desc(clansTable.memberCount), desc(clansTable.level), desc(clansTable.exp)];

  const clanCols = {
    id: clansTable.id,
    name: clansTable.name,
    emblemUrl: clansTable.emblemUrl,
    level: clansTable.level,
    exp: clansTable.exp,
    memberCount: clansTable.memberCount,
  };

  const clans = await db
    .select(clanCols)
    .from(clansTable)
    .orderBy(...candidateOrder)
    .limit(CLAN_RANKING_CANDIDATE_LIMIT);

  // Guarantee the caller's clan is in the pool so `myClanRank` is never falsely
  // null due only to candidate capping (and is exact whenever total clans <= cap).
  if (myMembership && !clans.some((c) => c.id === myMembership.clanId)) {
    const [mineRow] = await db
      .select(clanCols)
      .from(clansTable)
      .where(eq(clansTable.id, myMembership.clanId));
    if (mineRow) clans.push(mineRow);
  }

  if (clans.length === 0) {
    return { type, archetype, items: [], myClanRank: null };
  }

  const clanIds = clans.map((c) => c.id);

  // One bulk query: every candidate clan's members' persona xp/stats. No PII.
  const memberRows = await db
    .select({
      clanId: clanMembersTable.clanId,
      xp: personasTable.xp,
      stats: personasTable.stats,
    })
    .from(clanMembersTable)
    .leftJoin(personasTable, eq(personasTable.userId, clanMembersTable.userId))
    .where(inArray(clanMembersTable.clanId, clanIds));

  const byClan = new Map<string, { xp: number | null; stats: PersonaStats | null }[]>();
  for (const r of memberRows) {
    const arr = byClan.get(r.clanId);
    if (arr) arr.push({ xp: r.xp, stats: r.stats });
    else byClan.set(r.clanId, [{ xp: r.xp, stats: r.stats }]);
  }

  const ranked: RankedClan[] = clans.map((c) => {
    const metrics = computeClanMetrics(byClan.get(c.id) ?? []);
    return {
      clanId: c.id,
      name: c.name,
      emblemUrl: c.emblemUrl ?? null,
      level: c.level,
      exp: c.exp,
      memberCount: c.memberCount,
      clanPower: metrics.clanPower,
      averageLevel: metrics.averageLevel,
      dominantArchetype: metrics.dominantArchetype,
      dominantArchetypeLabel: metrics.dominantArchetypeLabel,
      topStrengths: metrics.topStrengths,
    };
  });

  const pool =
    archetype !== null
      ? ranked.filter((c) => c.dominantArchetype === archetype)
      : ranked;
  pool.sort(makeComparator(type));

  const items: ClanRankingItem[] = pool.slice(0, limit).map((c, i) => ({
    rank: i + 1,
    clanId: c.clanId,
    name: c.name,
    emblemUrl: c.emblemUrl,
    level: c.level,
    exp: c.exp,
    memberCount: c.memberCount,
    dominantArchetype: c.dominantArchetype,
    dominantArchetypeLabel: c.dominantArchetypeLabel,
    clanPower: c.clanPower,
    averageLevel: c.averageLevel,
    topStrengths: c.topStrengths,
    score: scoreOf(c, type),
  }));

  // My clan's rank within the full ranked pool (not just the sliced items). Null
  // when the user has no clan, or the clan is absent from this ranking (e.g. an
  // archetype filter that the clan's dominant archetype does not match).
  let myClanRank: MyClanRank | null = null;
  if (myMembership) {
    const myIndex = pool.findIndex((c) => c.clanId === myMembership.clanId);
    if (myIndex >= 0) {
      const myScore = scoreOf(pool[myIndex], type);
      const pointsToNextRank =
        myIndex === 0 ? 0 : Math.max(0, scoreOf(pool[myIndex - 1], type) - myScore);
      myClanRank = { rank: myIndex + 1, score: myScore, pointsToNextRank };
    }
  }

  return { type, archetype, items, myClanRank };
}
