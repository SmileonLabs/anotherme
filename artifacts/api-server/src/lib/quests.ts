import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  achievementsTable,
  clansTable,
  clanMembersTable,
  clanMemoriesTable,
  clanWarParticipantsTable,
  clanWarsTable,
  personasTable,
  questProgressTable,
  xpEventsTable,
  type Achievement,
  type QuestProgress,
  type QuestType,
} from "@workspace/db";
import { ensurePersona, recordReward } from "./growth";

/* ------------------------------------------------------------------------- */
/* Period keys (KST, UTC+9)                                                   */
/* ------------------------------------------------------------------------- */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** The calendar Y/M/D in KST for a UTC instant. */
function kstParts(now: Date): { y: number; m: number; d: number } {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth(), d: k.getUTCDate() };
}

/** `YYYY-MM-DD` in KST. */
export function dailyPeriodKey(now: Date): string {
  const { y, m, d } = kstParts(now);
  const mm = String(m + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** UTC instant of KST midnight that starts the current day. */
export function startOfDayKst(now: Date): Date {
  const { y, m, d } = kstParts(now);
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - KST_OFFSET_MS);
}

/** UTC instant of KST Monday 00:00 that starts the current ISO week. */
export function startOfWeekKst(now: Date): Date {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  const dow = k.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  const monday = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), 0, 0, 0);
  return new Date(monday - daysSinceMonday * 86400000 - KST_OFFSET_MS);
}

/** `YYYY-Www` ISO week key in KST. */
export function weeklyPeriodKey(now: Date): string {
  // Compute ISO week from the KST calendar date.
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  const date = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week =
    1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------------- */
/* Definitions                                                               */
/* ------------------------------------------------------------------------- */

export type QuestCategory = "daily" | "weekly";

export interface QuestDef {
  key: string;
  type: QuestType;
  title: string;
  description: string;
  target: number;
  rewardExp: number;
  /** Metric used to compute progress (see Metrics below). */
  metric: QuestMetric;
}

type QuestMetric =
  | "chat"
  | "battle"
  | "dungeonAction"
  | "clanContribution"
  | "analysis"
  | "dailyCompleted";

export const DAILY_QUESTS: QuestDef[] = [
  {
    key: "daily_chat",
    type: "daily",
    title: "오늘 첫 대화",
    description: "채팅 메시지를 1개 남겨보세요.",
    target: 1,
    rewardExp: 10,
    metric: "chat",
  },
  {
    key: "daily_battle",
    type: "daily",
    title: "토크배틀 참여",
    description: "토크배틀에서 발언하거나 배틀을 완료하세요.",
    target: 1,
    rewardExp: 20,
    metric: "battle",
  },
  {
    key: "daily_dungeon",
    type: "daily",
    title: "던전 행동",
    description: "던전에서 3번 행동하세요.",
    target: 3,
    rewardExp: 15,
    metric: "dungeonAction",
  },
  {
    key: "daily_clan",
    type: "daily",
    title: "가문 기여",
    description: "가문 기억을 작성하거나 가문전에 참여하세요.",
    target: 1,
    rewardExp: 20,
    metric: "clanContribution",
  },
  {
    key: "daily_analysis",
    type: "daily",
    title: "분석 업데이트",
    description: "Another Me AI 분석을 1회 실행하세요.",
    target: 1,
    rewardExp: 10,
    metric: "analysis",
  },
];

export const WEEKLY_QUESTS: QuestDef[] = [
  {
    key: "weekly_debater",
    type: "weekly",
    title: "토론가의 한 주",
    description: "토크배틀에 5번 참여하세요.",
    target: 5,
    rewardExp: 100,
    metric: "battle",
  },
  {
    key: "weekly_dungeon",
    type: "weekly",
    title: "던전 탐험가",
    description: "던전에서 20번 행동하세요.",
    target: 20,
    rewardExp: 100,
    metric: "dungeonAction",
  },
  {
    key: "weekly_clan",
    type: "weekly",
    title: "가문의 기둥",
    description: "가문 활동을 5번 하세요.",
    target: 5,
    rewardExp: 120,
    metric: "clanContribution",
  },
  {
    key: "weekly_growth",
    type: "weekly",
    title: "성장하는 자아",
    description: "일일 퀘스트를 5개 완료하세요.",
    target: 5,
    rewardExp: 150,
    metric: "dailyCompleted",
  },
];

export type AchievementCategory = "chat" | "battle" | "dungeon" | "clan" | "persona";

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  rewardExp: number;
  category: AchievementCategory;
  /** Icon name (Feather) for the mobile UI. */
  icon: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first_chat", title: "첫 대화", description: "처음으로 대화를 나눴어요.", rewardExp: 20, category: "chat", icon: "message-circle" },
  { key: "first_battle", title: "첫 토크배틀 참여", description: "처음으로 토크배틀에 참여했어요.", rewardExp: 20, category: "battle", icon: "zap" },
  { key: "first_battle_win", title: "첫 토크배틀 승리", description: "처음으로 토크배틀에서 승리했어요.", rewardExp: 50, category: "battle", icon: "award" },
  { key: "first_dungeon", title: "첫 던전 행동", description: "처음으로 던전에서 행동했어요.", rewardExp: 20, category: "dungeon", icon: "compass" },
  { key: "first_dungeon_goal", title: "첫 던전 목표 달성", description: "처음으로 던전 목표를 달성했어요.", rewardExp: 50, category: "dungeon", icon: "flag" },
  { key: "first_clan_join", title: "첫 가문 가입", description: "처음으로 가문에 들어갔어요.", rewardExp: 30, category: "clan", icon: "users" },
  { key: "first_clan_memory", title: "첫 가문 기억 작성", description: "처음으로 가문 기억을 남겼어요.", rewardExp: 30, category: "clan", icon: "book-open" },
  { key: "first_clan_war", title: "첫 가문전 참여", description: "처음으로 가문전에 참여했어요.", rewardExp: 40, category: "clan", icon: "shield" },
  { key: "first_clan_war_win", title: "첫 가문전 승리", description: "처음으로 가문전에서 승리했어요.", rewardExp: 80, category: "clan", icon: "shield" },
  { key: "persona_lv10", title: "Persona Lv.10 달성", description: "Another Me가 10레벨에 도달했어요.", rewardExp: 100, category: "persona", icon: "trending-up" },
  { key: "persona_lv30", title: "Persona Lv.30 달성", description: "Another Me가 30레벨에 도달했어요.", rewardExp: 300, category: "persona", icon: "trending-up" },
  { key: "clan_create", title: "가문 생성", description: "직접 가문을 만들었어요.", rewardExp: 50, category: "clan", icon: "flag" },
  { key: "clan_lv5", title: "가문 Lv.5 달성", description: "소속 가문이 5레벨에 도달했어요.", rewardExp: 100, category: "clan", icon: "star" },
];

/* ------------------------------------------------------------------------- */
/* Activity metrics                                                          */
/* ------------------------------------------------------------------------- */

interface ActivityCounts {
  chat: number;
  battle: number;
  dungeonAction: number;
  clanContribution: number;
  analysis: number;
}

/** Count one user's relevant activity since `since` (a UTC instant). */
async function activityCountsSince(userId: string, since: Date): Promise<ActivityCounts> {
  const [xpRows] = await db
    .select({
      chat: sql<number>`count(*) filter (where ${xpEventsTable.eventType} = 'chat_message')`,
      battle: sql<number>`count(*) filter (where ${xpEventsTable.eventType} in ('battle_speech','battle_result'))`,
      dungeonAction: sql<number>`count(*) filter (where ${xpEventsTable.eventType} = 'dungeon_action')`,
    })
    .from(xpEventsTable)
    .where(and(eq(xpEventsTable.userId, userId), gte(xpEventsTable.createdAt, since)));

  const [memRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(clanMemoriesTable)
    .where(
      and(
        eq(clanMemoriesTable.createdByUserId, userId),
        gte(clanMemoriesTable.createdAt, since),
      ),
    );

  const [warRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(clanWarParticipantsTable)
    .where(
      and(
        eq(clanWarParticipantsTable.userId, userId),
        gte(clanWarParticipantsTable.joinedAt, since),
      ),
    );

  const [persona] = await db
    .select({ lastAnalyzedAt: personasTable.lastAnalyzedAt })
    .from(personasTable)
    .where(eq(personasTable.userId, userId));

  const clanContribution = Number(memRow?.count ?? 0) + Number(warRow?.count ?? 0);
  const analysis =
    persona?.lastAnalyzedAt && persona.lastAnalyzedAt >= since ? 1 : 0;

  return {
    chat: Number(xpRows?.chat ?? 0),
    battle: Number(xpRows?.battle ?? 0),
    dungeonAction: Number(xpRows?.dungeonAction ?? 0),
    clanContribution,
    analysis,
  };
}

/** Number of distinct daily quests completed this week (for weekly_growth). */
async function dailyCompletedThisWeek(userId: string, weekStart: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(questProgressTable)
    .where(
      and(
        eq(questProgressTable.userId, userId),
        eq(questProgressTable.questType, "daily"),
        gte(questProgressTable.completedAt, weekStart),
      ),
    );
  return Number(row?.count ?? 0);
}

/* ------------------------------------------------------------------------- */
/* Quest read + upsert                                                       */
/* ------------------------------------------------------------------------- */

export interface QuestView {
  key: string;
  type: QuestType;
  title: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
  rewardClaimed: boolean;
  rewardExp: number;
}

function metricValue(
  metric: QuestMetric,
  daily: ActivityCounts,
  weekly: ActivityCounts,
  scope: QuestType,
  dailyCompleted: number,
): number {
  const counts = scope === "daily" ? daily : weekly;
  switch (metric) {
    case "chat":
      return counts.chat;
    case "battle":
      return counts.battle;
    case "dungeonAction":
      return counts.dungeonAction;
    case "clanContribution":
      return counts.clanContribution;
    case "analysis":
      return counts.analysis;
    case "dailyCompleted":
      return dailyCompleted;
  }
}

/**
 * Compute + persist the user's quests for the current periods, then return the
 * view. Recompute-on-read: progress is derived from existing activity and
 * upserted; `completedAt` is set when progress reaches target; `rewardClaimedAt`
 * is preserved (only the claim endpoint sets it).
 */
export async function getQuests(userId: string, now = new Date()): Promise<QuestView[]> {
  await ensurePersona(userId);

  const dayKey = dailyPeriodKey(now);
  const weekKey = weeklyPeriodKey(now);
  const dayStart = startOfDayKst(now);
  const weekStart = startOfWeekKst(now);

  const [daily, weekly, dailyCompleted] = await Promise.all([
    activityCountsSince(userId, dayStart),
    activityCountsSince(userId, weekStart),
    dailyCompletedThisWeek(userId, weekStart),
  ]);

  const defs = [...DAILY_QUESTS, ...WEEKLY_QUESTS];
  const views: QuestView[] = [];

  for (const def of defs) {
    const periodKey = def.type === "daily" ? dayKey : weekKey;
    const raw = metricValue(def.metric, daily, weekly, def.type, dailyCompleted);
    const progress = Math.min(raw, def.target);
    const completed = progress >= def.target;

    const [row] = await db
      .insert(questProgressTable)
      .values({
        userId,
        questKey: def.key,
        questType: def.type,
        periodKey,
        progress,
        target: def.target,
        rewardExp: def.rewardExp,
        completedAt: completed ? now : null,
      })
      .onConflictDoUpdate({
        target: [
          questProgressTable.userId,
          questProgressTable.questKey,
          questProgressTable.periodKey,
        ],
        set: {
          progress,
          target: def.target,
          rewardExp: def.rewardExp,
          // Stamp completion once and NEVER clear it: coalesce keeps any prior
          // timestamp, and when not yet complete we coalesce against null (a
          // no-op) so an in-period recompute can't erase an earlier completion.
          completedAt: sql`coalesce(${questProgressTable.completedAt}, ${completed ? now : null})`,
        },
      })
      .returning();

    views.push(toQuestView(def, row));
  }

  return views;
}

function toQuestView(def: QuestDef, row: QuestProgress): QuestView {
  return {
    key: def.key,
    type: def.type,
    title: def.title,
    description: def.description,
    progress: row.progress,
    target: row.target,
    completed: row.completedAt != null,
    rewardClaimed: row.rewardClaimedAt != null,
    rewardExp: row.rewardExp,
  };
}

export type ClaimResult =
  | { ok: true; rewardExp: number }
  | { ok: false; code: "not_found" | "not_completed" | "already_claimed" };

/**
 * Claim a quest reward. Re-validates completion from the freshly recomputed
 * state, grants Persona EXP idempotently via {@link recordReward} (keyed off the
 * period), then stamps `rewardClaimedAt`. The xp_event unique source_key is the
 * real double-claim guard; `rewardClaimedAt` is the UI flag.
 */
export async function claimQuest(
  userId: string,
  questKey: string,
  now = new Date(),
): Promise<ClaimResult> {
  const def = [...DAILY_QUESTS, ...WEEKLY_QUESTS].find((q) => q.key === questKey);
  if (!def) return { ok: false, code: "not_found" };

  // Recompute so a user can't claim a stale "completed" that no longer holds.
  await getQuests(userId, now);
  const periodKey = def.type === "daily" ? dailyPeriodKey(now) : weeklyPeriodKey(now);

  const [row] = await db
    .select()
    .from(questProgressTable)
    .where(
      and(
        eq(questProgressTable.userId, userId),
        eq(questProgressTable.questKey, questKey),
        eq(questProgressTable.periodKey, periodKey),
      ),
    );
  if (!row) return { ok: false, code: "not_found" };
  if (row.completedAt == null) return { ok: false, code: "not_completed" };
  if (row.rewardClaimedAt != null) return { ok: false, code: "already_claimed" };

  const granted = await recordReward({
    userId,
    sourceType: "quest",
    eventType: "quest_reward",
    sourceKey: `quest:${periodKey}:${questKey}:${userId}`,
    expDelta: def.rewardExp,
    reason: `퀘스트 보상 · ${def.title}`,
    metadata: { questKey, periodKey, questType: def.type },
  });

  // Self-heal the claim flag: the xp_event (source_key) is the real grant guard,
  // so always stamp rewardClaimedAt when it is missing — this repairs the case
  // where a prior attempt granted EXP but failed before flagging the row.
  await db
    .update(questProgressTable)
    .set({ rewardClaimedAt: now })
    .where(and(eq(questProgressTable.id, row.id), isNull(questProgressTable.rewardClaimedAt)));

  if (!granted) return { ok: false, code: "already_claimed" };
  return { ok: true, rewardExp: def.rewardExp };
}

/* ------------------------------------------------------------------------- */
/* Achievements                                                              */
/* ------------------------------------------------------------------------- */

export interface AchievementView {
  key: string;
  title: string;
  description: string;
  category: AchievementCategory;
  icon: string;
  unlocked: boolean;
  rewardClaimed: boolean;
  rewardExp: number;
}

/** Evaluate which achievement keys are currently unlocked for the user. */
async function evaluateUnlocked(userId: string): Promise<Set<string>> {
  const unlocked = new Set<string>();

  const [xp] = await db
    .select({
      chat: sql<number>`count(*) filter (where ${xpEventsTable.eventType} = 'chat_message')`,
      battle: sql<number>`count(*) filter (where ${xpEventsTable.eventType} in ('battle_speech','battle_result'))`,
      battleWin: sql<number>`count(*) filter (where ${xpEventsTable.eventType} = 'battle_result' and ${xpEventsTable.reason} = '토크배틀 승리')`,
      dungeonAction: sql<number>`count(*) filter (where ${xpEventsTable.eventType} = 'dungeon_action')`,
      dungeonGoal: sql<number>`count(*) filter (where ${xpEventsTable.eventType} = 'dungeon_result')`,
    })
    .from(xpEventsTable)
    .where(eq(xpEventsTable.userId, userId));

  if (Number(xp?.chat ?? 0) > 0) unlocked.add("first_chat");
  if (Number(xp?.battle ?? 0) > 0) unlocked.add("first_battle");
  if (Number(xp?.battleWin ?? 0) > 0) unlocked.add("first_battle_win");
  if (Number(xp?.dungeonAction ?? 0) > 0) unlocked.add("first_dungeon");
  if (Number(xp?.dungeonGoal ?? 0) > 0) unlocked.add("first_dungeon_goal");

  const [membership] = await db
    .select({ role: clanMembersTable.role, clanId: clanMembersTable.clanId })
    .from(clanMembersTable)
    .where(eq(clanMembersTable.userId, userId));
  if (membership) {
    unlocked.add("first_clan_join");
    if (membership.role === "owner") unlocked.add("clan_create");
  }

  const [mem] = await db
    .select({ count: sql<number>`count(*)` })
    .from(clanMemoriesTable)
    .where(eq(clanMemoriesTable.createdByUserId, userId));
  if (Number(mem?.count ?? 0) > 0) unlocked.add("first_clan_memory");

  const warParts = await db
    .select({ clanId: clanWarParticipantsTable.clanId, warId: clanWarParticipantsTable.warId })
    .from(clanWarParticipantsTable)
    .where(eq(clanWarParticipantsTable.userId, userId));
  if (warParts.length > 0) {
    unlocked.add("first_clan_war");
    const warIds = warParts.map((w) => w.warId);
    const wars = await db
      .select({ id: clanWarsTable.id, winnerClanId: clanWarsTable.winnerClanId })
      .from(clanWarsTable)
      .where(inArray(clanWarsTable.id, warIds));
    const wonByClan = new Map(wars.map((w) => [w.id, w.winnerClanId]));
    if (warParts.some((p) => wonByClan.get(p.warId) === p.clanId)) {
      unlocked.add("first_clan_war_win");
    }
  }

  const [persona] = await db
    .select({ level: personasTable.level })
    .from(personasTable)
    .where(eq(personasTable.userId, userId));
  if (persona) {
    if (persona.level >= 10) unlocked.add("persona_lv10");
    if (persona.level >= 30) unlocked.add("persona_lv30");
  }

  if (membership) {
    const [clan] = await db
      .select({ level: clansTable.level })
      .from(clansTable)
      .where(eq(clansTable.id, membership.clanId));
    if (clan && clan.level >= 5) unlocked.add("clan_lv5");
  }

  return unlocked;
}

/** Compute + persist unlocked achievements, then return the full view list. */
export async function getAchievements(
  userId: string,
  now = new Date(),
): Promise<AchievementView[]> {
  await ensurePersona(userId);
  const unlocked = await evaluateUnlocked(userId);

  // Upsert a row for each newly-unlocked achievement (idempotent).
  for (const def of ACHIEVEMENTS) {
    if (!unlocked.has(def.key)) continue;
    await db
      .insert(achievementsTable)
      .values({
        userId,
        achievementKey: def.key,
        unlockedAt: now,
        rewardExp: def.rewardExp,
      })
      .onConflictDoNothing({
        target: [achievementsTable.userId, achievementsTable.achievementKey],
      });
  }

  const rows = await db
    .select()
    .from(achievementsTable)
    .where(eq(achievementsTable.userId, userId));
  const byKey = new Map<string, Achievement>(rows.map((r) => [r.achievementKey, r]));

  return ACHIEVEMENTS.map((def) => {
    const row = byKey.get(def.key);
    return {
      key: def.key,
      title: def.title,
      description: def.description,
      category: def.category,
      icon: def.icon,
      unlocked: row != null,
      rewardClaimed: row?.rewardClaimedAt != null,
      rewardExp: def.rewardExp,
    };
  });
}

export async function claimAchievement(
  userId: string,
  achievementKey: string,
  now = new Date(),
): Promise<ClaimResult> {
  const def = ACHIEVEMENTS.find((a) => a.key === achievementKey);
  if (!def) return { ok: false, code: "not_found" };

  // Recompute so unlock state is fresh before granting.
  await getAchievements(userId, now);

  const [row] = await db
    .select()
    .from(achievementsTable)
    .where(
      and(
        eq(achievementsTable.userId, userId),
        eq(achievementsTable.achievementKey, achievementKey),
      ),
    );
  if (!row) return { ok: false, code: "not_completed" };
  if (row.rewardClaimedAt != null) return { ok: false, code: "already_claimed" };

  const granted = await recordReward({
    userId,
    sourceType: "achievement",
    eventType: "achievement_reward",
    sourceKey: `achievement:${achievementKey}:${userId}`,
    expDelta: def.rewardExp,
    reason: `업적 보상 · ${def.title}`,
    metadata: { achievementKey },
  });

  // Self-heal the claim flag (see claimQuest): the xp_event source_key is the
  // grant guard, so stamp rewardClaimedAt whenever it is still missing.
  await db
    .update(achievementsTable)
    .set({ rewardClaimedAt: now })
    .where(and(eq(achievementsTable.id, row.id), isNull(achievementsTable.rewardClaimedAt)));

  if (!granted) return { ok: false, code: "already_claimed" };
  return { ok: true, rewardExp: def.rewardExp };
}

/* ------------------------------------------------------------------------- */
/* Rewards summary (for badges)                                              */
/* ------------------------------------------------------------------------- */

export interface RewardsSummary {
  claimableQuests: number;
  claimableAchievements: number;
  total: number;
}

/** Lightweight count of unclaimed-but-claimable rewards for badge display. */
export async function getRewardsSummary(
  userId: string,
  now = new Date(),
): Promise<RewardsSummary> {
  const [quests, achievements] = await Promise.all([
    getQuests(userId, now),
    getAchievements(userId, now),
  ]);
  const claimableQuests = quests.filter((q) => q.completed && !q.rewardClaimed).length;
  const claimableAchievements = achievements.filter(
    (a) => a.unlocked && !a.rewardClaimed,
  ).length;
  return {
    claimableQuests,
    claimableAchievements,
    total: claimableQuests + claimableAchievements,
  };
}
