import { desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  DEFAULT_FAN_STATS,
  DEFAULT_PERSONA_STATS,
  DEFAULT_STAR_STATS,
  fanProfilesTable,
  personasTable,
  starProfilesTable,
  userBattleStatsTable,
  usersTable,
  type FanStats,
  type PersonaStats,
  type StarStats,
} from "@workspace/db";
import { battleLevelInfo } from "./battleRules";
import { computeLevel } from "./growth";
import { computeIdentity } from "./personaIdentity";
import { getActiveCharacterIdentityMap } from "./characterProfiles";

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

export const SERVICE_RANKING_SCOPES = ["persona", "fan", "star", "battle"] as const;
export type ServiceRankingScope = (typeof SERVICE_RANKING_SCOPES)[number];

export const SERVICE_RANKING_TYPES = [
  "overall",
  "persuasion",
  "logic",
  "empathy",
  "strategy",
  "archetype",
  "fan_power",
  "support_power",
  "story",
  "charm",
  "stage_presence",
  "bond",
  "lore",
  "wins",
  "win_rate",
  "streak",
] as const;
export type ServiceRankingType = (typeof SERVICE_RANKING_TYPES)[number];

export interface ServiceRankingItem {
  id: string;
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  title: string;
  subTitle: string;
  badgeLabel: string;
  score: number;
  primaryStatLabel: string;
  primaryStatValue: number;
}

export interface ServiceRankingResult {
  scope: ServiceRankingScope;
  type: ServiceRankingType;
  archetype: ArchetypeKey | null;
  items: ServiceRankingItem[];
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
    })
    .from(personasTable)
    .innerJoin(usersTable, eq(personasTable.userId, usersTable.id));

  const identities = await getActiveCharacterIdentityMap(rows.map((row) => row.userId));
  const enriched: EnrichedRow[] = rows.map((r) => {
    const stats: PersonaStats = { ...DEFAULT_PERSONA_STATS, ...r.stats };
    const level = computeLevel(r.xp);
    const identity = computeIdentity(stats);
    const overallScore = level * 1000 + r.xp + totalStats(stats) * 10;
    return {
      userId: r.userId,
      displayName: `${r.nickname?.trim() || "나"}의 어나더 미`,
      avatarUrl: identities.get(r.userId)?.profileImageUrl ?? null,
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

function sumStats(stats: object): number {
  return Object.values(stats).reduce(
    (sum, value) => sum + (typeof value === "number" ? value : 0),
    0,
  );
}

function serviceRank<T extends { id: string; userId: string; score: number }>(
  rows: T[],
  limit: number,
  meUserId: string,
  toItem: (row: T, rank: number) => ServiceRankingItem,
): { items: ServiceRankingItem[]; myRank: MyRank | null } {
  const safeLimit = Math.min(RANKING_LIMIT_MAX, Math.max(1, limit));
  const items = rows.slice(0, safeLimit).map((row, index) => toItem(row, index + 1));
  const myIndex = rows.findIndex((row) => row.userId === meUserId);
  let myRank: MyRank | null = null;
  if (myIndex >= 0) {
    const myScore = rows[myIndex].score;
    const pointsToNextRank = myIndex === 0 ? 0 : Math.max(0, rows[myIndex - 1].score - myScore);
    myRank = { rank: myIndex + 1, score: myScore, pointsToNextRank };
  }
  return { items, myRank };
}

function genericComparator<T extends { score: number; level: number; tieScore: number; id: string }>(
  a: T,
  b: T,
): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.level !== a.level) return b.level - a.level;
  if (b.tieScore !== a.tieScore) return b.tieScore - a.tieScore;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function personaTypeForService(type: ServiceRankingType): RankingType {
  return (RANKING_TYPES as readonly string[]).includes(type) ? (type as RankingType) : "overall";
}

function normalizeServiceType(scope: ServiceRankingScope, type: string | null | undefined): ServiceRankingType {
  const raw = (SERVICE_RANKING_TYPES as readonly string[]).includes(String(type))
    ? (type as ServiceRankingType)
    : "overall";
  if (scope === "persona") return personaTypeForService(raw) as ServiceRankingType;
  if (scope === "fan") {
    return (["overall", "fan_power", "support_power", "empathy", "story"] as const).includes(
      raw as never,
    )
      ? raw
      : "overall";
  }
  if (scope === "star") {
    return (["overall", "charm", "stage_presence", "bond", "lore"] as const).includes(raw as never)
      ? raw
      : "overall";
  }
  return (["overall", "wins", "win_rate", "streak"] as const).includes(raw as never)
    ? raw
    : "overall";
}

function fanScore(stats: FanStats, type: ServiceRankingType, level: number, xp: number): number {
  switch (type) {
    case "fan_power":
      return stats.fanPower;
    case "support_power":
      return stats.supportPower;
    case "empathy":
      return stats.empathy;
    case "story":
      return stats.story;
    case "overall":
    default:
      return level * 1000 + xp + sumStats(stats) * 10;
  }
}

function fanPrimary(stats: FanStats, type: ServiceRankingType): { label: string; value: number } {
  switch (type) {
    case "fan_power":
      return { label: "매력", value: stats.fanPower };
    case "support_power":
      return { label: "응원력", value: stats.supportPower };
    case "empathy":
      return { label: "공감", value: stats.empathy };
    case "story":
      return { label: "스토리", value: stats.story };
    case "overall":
    default:
      return { label: "FAN XP", value: 0 };
  }
}

function starScore(stats: StarStats, type: ServiceRankingType, level: number, xp: number): number {
  switch (type) {
    case "charm":
      return stats.charm;
    case "stage_presence":
      return stats.stagePresence;
    case "bond":
      return stats.bond;
    case "lore":
      return stats.lore;
    case "overall":
    default:
      return level * 1000 + xp + sumStats(stats) * 10;
  }
}

function starPrimary(stats: StarStats, type: ServiceRankingType): { label: string; value: number } {
  switch (type) {
    case "charm":
      return { label: "매력", value: stats.charm };
    case "stage_presence":
      return { label: "스타성", value: stats.stagePresence };
    case "bond":
      return { label: "유대감", value: stats.bond };
    case "lore":
      return { label: "영향력", value: stats.lore };
    case "overall":
    default:
      return { label: "STAR XP", value: 0 };
  }
}

function battleScore(row: {
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  mp: number;
}, type: ServiceRankingType): number {
  const total = row.wins + row.losses + row.draws;
  switch (type) {
    case "wins":
      return row.wins;
    case "win_rate":
      return total > 0 ? Math.round((row.wins / total) * 1000) : 0;
    case "streak":
      return row.bestStreak;
    case "overall":
    default:
      return row.mp;
  }
}

function battlePrimary(row: {
  wins: number;
  losses: number;
  draws: number;
  bestStreak: number;
}, type: ServiceRankingType): { label: string; value: number } {
  const total = row.wins + row.losses + row.draws;
  switch (type) {
    case "wins":
      return { label: "승리", value: row.wins };
    case "win_rate":
      return { label: "승률", value: total > 0 ? Math.round((row.wins / total) * 100) : 0 };
    case "streak":
      return { label: "최고 연승", value: row.bestStreak };
    case "overall":
    default:
      return { label: "TP", value: 0 };
  }
}

async function getPersonaServiceRankings(opts: {
  type: ServiceRankingType;
  archetype?: ArchetypeKey | null;
  limit: number;
  meUserId: string;
}): Promise<ServiceRankingResult> {
  const personaType = personaTypeForService(opts.type);
  const result = await getRankings({
    type: personaType,
    archetype: opts.archetype,
    limit: opts.limit,
    meUserId: opts.meUserId,
  });
  return {
    scope: "persona",
    type: personaType as ServiceRankingType,
    archetype: result.archetype,
    myRank: result.myRank,
    items: result.items.map((item) => ({
      id: item.userId,
      rank: item.rank,
      userId: item.userId,
      displayName: item.displayName,
      avatarUrl: item.avatarUrl,
      level: item.level,
      title: item.title,
      subTitle: `${item.title} · ${item.archetypeLabel}`,
      badgeLabel: "자아",
      score: item.score,
      primaryStatLabel: item.primaryStatLabel,
      primaryStatValue: item.primaryStatValue,
    })),
  };
}

async function getFanServiceRankings(opts: {
  type: ServiceRankingType;
  limit: number;
  meUserId: string;
}): Promise<ServiceRankingResult> {
  type Row = {
    id: string;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    level: number;
    xp: number;
    stats: FanStats;
    score: number;
    tieScore: number;
    primary: { label: string; value: number };
  };
  const rows = await db
    .select({
      userId: fanProfilesTable.userId,
      level: fanProfilesTable.level,
      xp: fanProfilesTable.xp,
      stats: fanProfilesTable.stats,
      nickname: usersTable.nickname,
    })
    .from(fanProfilesTable)
    .innerJoin(usersTable, eq(fanProfilesTable.userId, usersTable.id));
  const identities = await getActiveCharacterIdentityMap(rows.map((row) => row.userId));
  const ranked: Row[] = rows.map((row) => {
    const stats: FanStats = { ...DEFAULT_FAN_STATS, ...row.stats };
    const score = fanScore(stats, opts.type, row.level, row.xp);
    return {
      id: row.userId,
      userId: row.userId,
      displayName: `${row.nickname?.trim() || "나"} FAN`,
      avatarUrl: identities.get(row.userId)?.profileImageUrl ?? null,
      level: row.level,
      xp: row.xp,
      stats,
      score,
      tieScore: row.xp,
      primary: opts.type === "overall" ? { label: "FAN XP", value: row.xp } : fanPrimary(stats, opts.type),
    };
  });
  ranked.sort(genericComparator);
  const { items, myRank } = serviceRank(ranked, opts.limit, opts.meUserId, (row, rank) => ({
    id: row.id,
    rank,
    userId: row.userId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    level: row.level,
    title: "FAN",
    subTitle: `FAN Lv.${row.level} · XP ${row.xp.toLocaleString()}`,
    badgeLabel: "FAN",
    score: row.score,
    primaryStatLabel: row.primary.label,
    primaryStatValue: row.primary.value,
  }));
  return { scope: "fan", type: opts.type, archetype: null, items, myRank };
}

async function getStarServiceRankings(opts: {
  type: ServiceRankingType;
  limit: number;
  meUserId: string;
}): Promise<ServiceRankingResult> {
  type Row = {
    id: string;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    level: number;
    xp: number;
    stage: string;
    score: number;
    tieScore: number;
    primary: { label: string; value: number };
  };
  const rows = await db
    .select({
      id: starProfilesTable.id,
      userId: starProfilesTable.userId,
      displayName: starProfilesTable.displayName,
      imageUrl: starProfilesTable.imageUrl,
      stage: starProfilesTable.stage,
      level: starProfilesTable.level,
      xp: starProfilesTable.xp,
      stats: starProfilesTable.stats,
      nickname: usersTable.nickname,
    })
    .from(starProfilesTable)
    .innerJoin(usersTable, eq(starProfilesTable.userId, usersTable.id))
    .orderBy(desc(starProfilesTable.equippedAt));
  const ranked: Row[] = rows.map((row) => {
    const stats: StarStats = { ...DEFAULT_STAR_STATS, ...row.stats };
    const score = starScore(stats, opts.type, row.level, row.xp);
    const stageLabel = row.stage === "promoted" ? "공식 STAR" : "연습생 STAR";
    return {
      id: row.id,
      userId: row.userId,
      displayName: row.displayName || `${row.nickname?.trim() || "나"} STAR`,
      avatarUrl: row.imageUrl ?? null,
      level: row.level,
      xp: row.xp,
      stage: row.stage,
      score,
      tieScore: row.xp,
      primary: opts.type === "overall" ? { label: "STAR XP", value: row.xp } : starPrimary(stats, opts.type),
      title: stageLabel,
    };
  });
  ranked.sort(genericComparator);
  const { items, myRank } = serviceRank(ranked, opts.limit, opts.meUserId, (row, rank) => ({
    id: row.id,
    rank,
    userId: row.userId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    level: row.level,
    title: row.stage === "promoted" ? "공식 STAR" : "연습생 STAR",
    subTitle: `${row.stage === "promoted" ? "공식 STAR" : "연습생 STAR"} Lv.${row.level}`,
    badgeLabel: "STAR",
    score: row.score,
    primaryStatLabel: row.primary.label,
    primaryStatValue: row.primary.value,
  }));
  return { scope: "star", type: opts.type, archetype: null, items, myRank };
}

async function getBattleServiceRankings(opts: {
  type: ServiceRankingType;
  limit: number;
  meUserId: string;
}): Promise<ServiceRankingResult> {
  type Row = {
    id: string;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    level: number;
    title: string;
    mp: number;
    wins: number;
    losses: number;
    draws: number;
    score: number;
    tieScore: number;
    primary: { label: string; value: number };
  };
  const rows = await db
    .select({
      userId: userBattleStatsTable.userId,
      wins: userBattleStatsTable.wins,
      losses: userBattleStatsTable.losses,
      draws: userBattleStatsTable.draws,
      currentStreak: userBattleStatsTable.currentStreak,
      bestStreak: userBattleStatsTable.bestStreak,
      mp: userBattleStatsTable.mp,
      nickname: usersTable.nickname,
    })
    .from(userBattleStatsTable)
    .innerJoin(usersTable, eq(userBattleStatsTable.userId, usersTable.id));
  const identities = await getActiveCharacterIdentityMap(rows.map((row) => row.userId));
  const ranked: Row[] = rows.map((row) => {
    const level = battleLevelInfo(row.mp);
    return {
      id: row.userId,
      userId: row.userId,
      displayName: row.nickname?.trim() || "참가자",
      avatarUrl: identities.get(row.userId)?.profileImageUrl ?? null,
      level: level.level,
      title: level.title,
      mp: row.mp,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      score: battleScore(row, opts.type),
      tieScore: row.mp,
      primary: opts.type === "overall" ? { label: "TP", value: row.mp } : battlePrimary(row, opts.type),
    };
  });
  ranked.sort(genericComparator);
  const { items, myRank } = serviceRank(ranked, opts.limit, opts.meUserId, (row, rank) => ({
    id: row.id,
    rank,
    userId: row.userId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    level: row.level,
    title: row.title,
    subTitle: `Lv.${row.level} · ${row.wins}승 ${row.draws}무 ${row.losses}패`,
    badgeLabel: "배틀",
    score: row.score,
    primaryStatLabel: row.primary.label,
    primaryStatValue: row.primary.value,
  }));
  return { scope: "battle", type: opts.type, archetype: null, items, myRank };
}

export async function getServiceRankings(opts: {
  scope: ServiceRankingScope;
  type?: string | null;
  archetype?: ArchetypeKey | null;
  limit: number;
  meUserId: string;
}): Promise<ServiceRankingResult> {
  const type = normalizeServiceType(opts.scope, opts.type);
  if (opts.scope === "persona") {
    return getPersonaServiceRankings({
      type,
      archetype: opts.archetype,
      limit: opts.limit,
      meUserId: opts.meUserId,
    });
  }
  if (opts.scope === "fan") {
    return getFanServiceRankings({ type, limit: opts.limit, meUserId: opts.meUserId });
  }
  if (opts.scope === "star") {
    return getStarServiceRankings({ type, limit: opts.limit, meUserId: opts.meUserId });
  }
  return getBattleServiceRankings({ type, limit: opts.limit, meUserId: opts.meUserId });
}
