import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  DEFAULT_PERSONA_STATS,
  personasTable,
  usersTable,
  type PersonaStats,
} from "@workspace/db";
import { computeLevel } from "./growth";
import { computeIdentity } from "./personaIdentity";

type StatKey = keyof PersonaStats;

/** The ranking categories the API supports. */
export const RANKING_TYPES = [
  "overall",
  "persuasion",
  "logic",
  "empathy",
  "strategy",
  "archetype",
] as const;
export type RankingType = (typeof RANKING_TYPES)[number];

/** Archetype keys (must match the keys produced by computeIdentity). */
export const ARCHETYPE_KEYS = [
  "strategist",
  "harmonizer",
  "explorer",
  "pioneer",
  "sage",
  "entertainer",
  "activist",
  "observer",
] as const;
export type ArchetypeKey = (typeof ARCHETYPE_KEYS)[number];

export const RANKING_LIMIT_DEFAULT = 50;
export const RANKING_LIMIT_MAX = 100;

/**
 * Which persona stat backs each stat-based ranking type. The product spec uses
 * "설득력(persuasion)" and "전략성(strategy)"; the closest existing deterministic
 * stats are `conviction` and `decisiveness` respectively.
 */
const STAT_BY_TYPE: Partial<Record<RankingType, StatKey>> = {
  persuasion: "conviction",
  logic: "logic",
  empathy: "empathy",
  strategy: "decisiveness",
};

/** Ranking-feature Korean labels for stats (spec vocabulary). */
const STAT_LABEL: Record<StatKey, string> = {
  logic: "논리력",
  empathy: "공감력",
  wit: "순발력",
  knowledge: "지식",
  conviction: "설득력",
  emotion: "감정 표현",
  decisiveness: "전략성",
};

export interface RankingItem {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  title: string;
  /** Archetype key, e.g. "strategist". */
  archetype: string;
  /** Archetype display label, e.g. "전략가형". */
  archetypeLabel: string;
  score: number;
  primaryStatLabel: string;
  primaryStatValue: number;
}

export interface MyRank {
  rank: number;
  score: number;
  /** Score gap to the rank directly above (0 when already first). */
  pointsToNextRank: number;
}

export interface RankingResult {
  type: RankingType;
  archetype: ArchetypeKey | null;
  items: RankingItem[];
  myRank: MyRank | null;
}

interface EnrichedRow {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  stats: PersonaStats;
  level: number;
  archetypeKey: string;
  archetypeLabel: string;
  title: string;
  overallScore: number;
  xp: number;
}

function totalStats(stats: PersonaStats): number {
  return Object.values(stats).reduce((a, b) => a + (b ?? 0), 0);
}

/** The single strongest stat as a (label, value) pair — used for overall/archetype. */
function strongestStat(stats: PersonaStats): { label: string; value: number } {
  let bestKey: StatKey = "logic";
  let bestVal = -1;
  for (const key of Object.keys(STAT_LABEL) as StatKey[]) {
    const v = stats[key] ?? 0;
    if (v > bestVal) {
      bestVal = v;
      bestKey = key;
    }
  }
  return { label: STAT_LABEL[bestKey], value: Math.max(0, bestVal) };
}

function scoreOf(row: EnrichedRow, type: RankingType): number {
  const statKey = STAT_BY_TYPE[type];
  if (statKey) return row.stats[statKey] ?? 0;
  return row.overallScore;
}

function primaryStatOf(
  row: EnrichedRow,
  type: RankingType,
): { label: string; value: number } {
  const statKey = STAT_BY_TYPE[type];
  if (statKey) return { label: STAT_LABEL[statKey], value: row.stats[statKey] ?? 0 };
  return strongestStat(row.stats);
}

/**
 * Comparator: primary key desc, then deterministic tie-break level desc, xp desc,
 * userId asc (so order is stable across calls). For stat rankings the primary key
 * is the backing stat value; for overall/archetype it is the overall score.
 */
function makeComparator(type: RankingType) {
  const statKey = STAT_BY_TYPE[type];
  return (a: EnrichedRow, b: EnrichedRow): number => {
    const pa = statKey ? a.stats[statKey] ?? 0 : a.overallScore;
    const pb = statKey ? b.stats[statKey] ?? 0 : b.overallScore;
    if (pb !== pa) return pb - pa;
    if (b.level !== a.level) return b.level - a.level;
    if (b.xp !== a.xp) return b.xp - a.xp;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  };
}

/**
 * Compute a leaderboard. Read-only: it never mutates personas, XP events, or the
 * persona-card history. Identity (archetype/title) is derived in-process via the
 * shared rule-based computeIdentity (no AI call). Currently a live full-table
 * query; the single entry point is kept service-shaped so a future season/cache
 * layer can wrap it without touching the route.
 */
export async function getRankings(opts: {
  type: RankingType;
  archetype?: ArchetypeKey | null;
  limit: number;
  meUserId: string;
}): Promise<RankingResult> {
  const { type, meUserId } = opts;
  const limit = Math.min(RANKING_LIMIT_MAX, Math.max(1, opts.limit));
  const archetype: ArchetypeKey | null =
    type === "archetype" ? opts.archetype ?? "strategist" : null;

  const rows = await db
    .select({
      userId: personasTable.userId,
      xp: personasTable.xp,
      stats: personasTable.stats,
      nickname: usersTable.nickname,
      avatarUrl: usersTable.profileImageUrl,
    })
    .from(personasTable)
    .innerJoin(usersTable, eq(personasTable.userId, usersTable.id));

  const enriched: EnrichedRow[] = rows.map((r) => {
    const stats: PersonaStats = { ...DEFAULT_PERSONA_STATS, ...r.stats };
    const level = computeLevel(r.xp);
    const identity = computeIdentity(stats);
    const overallScore = level * 1000 + r.xp + totalStats(stats) * 10;
    return {
      userId: r.userId,
      displayName: `${r.nickname?.trim() || "나"}의 어나더 미`,
      avatarUrl: r.avatarUrl ?? null,
      stats,
      level,
      archetypeKey: identity.archetypeKey,
      archetypeLabel: identity.archetype,
      title: identity.title,
      overallScore,
      xp: r.xp,
    };
  });

  const pool =
    archetype !== null
      ? enriched.filter((e) => e.archetypeKey === archetype)
      : enriched;

  pool.sort(makeComparator(type));

  const items: RankingItem[] = pool.slice(0, limit).map((e, i) => {
    const primary = primaryStatOf(e, type);
    return {
      rank: i + 1,
      userId: e.userId,
      displayName: e.displayName,
      avatarUrl: e.avatarUrl,
      level: e.level,
      title: e.title,
      archetype: e.archetypeKey,
      archetypeLabel: e.archetypeLabel,
      score: scoreOf(e, type),
      primaryStatLabel: primary.label,
      primaryStatValue: primary.value,
    };
  });

  const myIndex = pool.findIndex((e) => e.userId === meUserId);
  let myRank: MyRank | null = null;
  if (myIndex >= 0) {
    const myScore = scoreOf(pool[myIndex], type);
    const pointsToNextRank =
      myIndex === 0 ? 0 : Math.max(0, scoreOf(pool[myIndex - 1], type) - myScore);
    myRank = { rank: myIndex + 1, score: myScore, pointsToNextRank };
  }

  return { type, archetype, items, myRank };
}
