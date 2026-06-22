import { desc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import { db } from "@workspace/db";
import {
  DEFAULT_PERSONA_STATS,
  personasTable,
  xpEventsTable,
  type GrowthEventType,
  type GrowthSourceType,
  type Persona,
  type PersonaStats,
  type XpEvent,
} from "@workspace/db";
import { logger as defaultLogger } from "./logger";
import { awardClanExp, clanExpForGrowth, CLAN_BASE_RATE } from "./clanGrowth";

/**
 * Internal grant kinds. These are finer-grained than the stored `eventType`
 * (e.g. battle win/loss/draw all map to the `battle_result` event type) because
 * the XP/stat payout differs per outcome. Callers pass a `GrowthKind`; the rule
 * below decides the stored `sourceType`/`eventType`, the XP, the stat deltas, and
 * a default human-readable Korean reason.
 */
export type GrowthKind =
  | "chat_message"
  | "battle_speech"
  | "battle_win"
  | "battle_loss"
  | "battle_draw"
  | "dungeon_action"
  | "dungeon_goal";

interface GrowthRule {
  sourceType: GrowthSourceType;
  eventType: GrowthEventType;
  xp: number;
  stats: Partial<PersonaStats>;
  reason: string;
}

/**
 * Deterministic growth rules. Each activity grants a fixed amount of XP and a
 * small set of stat increases — no AI, no cost. Tuned so that frequent-but-cheap
 * actions (chat) grant little, and rare-but-meaningful ones (battle win, dungeon
 * goal) grant a lot.
 */
const GROWTH_RULES: Record<GrowthKind, GrowthRule> = {
  chat_message: {
    sourceType: "chat",
    eventType: "chat_message",
    xp: 2,
    stats: { empathy: 1 },
    reason: "채팅 참여",
  },
  battle_speech: {
    sourceType: "battle",
    eventType: "battle_speech",
    xp: 5,
    stats: { logic: 1, wit: 1 },
    reason: "토크배틀 발언",
  },
  battle_win: {
    sourceType: "battle",
    eventType: "battle_result",
    xp: 30,
    stats: { conviction: 2, logic: 1 },
    reason: "토크배틀 승리",
  },
  battle_loss: {
    sourceType: "battle",
    eventType: "battle_result",
    xp: 10,
    stats: { emotion: 1 },
    reason: "토크배틀 패배",
  },
  battle_draw: {
    sourceType: "battle",
    eventType: "battle_result",
    xp: 15,
    stats: { conviction: 1, emotion: 1 },
    reason: "토크배틀 무승부",
  },
  dungeon_action: {
    sourceType: "dungeon",
    eventType: "dungeon_action",
    xp: 4,
    stats: { decisiveness: 1 },
    reason: "던전 모험",
  },
  dungeon_goal: {
    sourceType: "dungeon",
    eventType: "dungeon_result",
    xp: 20,
    stats: { knowledge: 2, decisiveness: 1 },
    reason: "던전 목표 달성",
  },
};

/**
 * Cumulative XP required to *reach* a given level. Level n→n+1 costs `100 * n`
 * XP, so reaching level L needs `50 * (L-1) * L` total XP (1→2: 100, 2→3: 200…).
 */
export function xpToReachLevel(level: number): number {
  if (level <= 1) return 0;
  return 50 * (level - 1) * level;
}

/** The level a persona is at for a given cumulative XP total. */
export function computeLevel(xp: number): number {
  let level = 1;
  while (xp >= xpToReachLevel(level + 1)) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  totalXp: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP span of the current level (current → next). */
  xpForNextLevel: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = computeLevel(xp);
  const floor = xpToReachLevel(level);
  const ceil = xpToReachLevel(level + 1);
  return {
    level,
    totalXp: xp,
    xpIntoLevel: xp - floor,
    xpForNextLevel: ceil - floor,
  };
}

/**
 * Fetch the caller's persona, creating it lazily if absent. Concurrency-safe via
 * an upsert that no-ops on conflict, then re-reads.
 */
export async function ensurePersona(userId: string): Promise<Persona | undefined> {
  const [existing] = await db
    .select()
    .from(personasTable)
    .where(eq(personasTable.userId, userId));
  if (existing) return existing;

  const [created] = await db
    .insert(personasTable)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [after] = await db
    .select()
    .from(personasTable)
    .where(eq(personasTable.userId, userId));
  return after;
}

/** The most recent growth events for a user, newest first. */
export async function recentGrowthEvents(userId: string, limit = 20): Promise<XpEvent[]> {
  return db
    .select()
    .from(xpEventsTable)
    .where(eq(xpEventsTable.userId, userId))
    .orderBy(desc(xpEventsTable.createdAt))
    .limit(limit);
}

export interface RecordActivityParams {
  userId: string;
  kind: GrowthKind;
  /** Deterministic idempotency key — must be unique per real-world activity. */
  sourceKey: string;
  /** Opaque source pointer (message/room id). */
  sourceId?: string | null;
  /** Overrides the rule's default Korean reason when present. */
  reason?: string;
  /** Extra structured context for future AI/family/ranking features. */
  metadata?: Record<string, unknown>;
  log?: Logger;
}

/**
 * Record a single growth event and apply it to the user's persona. This is the
 * one entry point existing features call. It NEVER throws — any failure is
 * logged and swallowed so growth tracking can never break a core action. Callers
 * may safely fire-and-forget it.
 *
 * Idempotency + atomicity: the persona row is locked (`FOR UPDATE`) so concurrent
 * events for the same user serialize instead of racing on a stale read-modify-
 * write. The event insert uses `ON CONFLICT (source_key) DO NOTHING`; if the key
 * already exists the persona is left untouched, so a replay grants nothing twice.
 * The log insert and the persona bump share one transaction so the append-only
 * log and the rolled-up totals can never diverge.
 */
export async function recordActivity(params: RecordActivityParams): Promise<void> {
  const { userId, kind, sourceKey, sourceId, reason, metadata } = params;
  const log = params.log ?? defaultLogger;
  try {
    const rule = GROWTH_RULES[kind];
    if (!rule) return;

    // Make sure the persona exists before we try to lock it.
    const ensured = await ensurePersona(userId);
    if (!ensured) return;

    let granted = false;
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(personasTable)
        .where(eq(personasTable.userId, userId))
        .for("update");
      if (!locked) return;

      const beforeExp = locked.xp;
      const beforeLevel = locked.level;
      const afterExp = beforeExp + rule.xp;
      const afterLevel = computeLevel(afterExp);
      const newStats: PersonaStats = { ...DEFAULT_PERSONA_STATS, ...locked.stats };
      for (const [key, delta] of Object.entries(rule.stats)) {
        const k = key as keyof PersonaStats;
        newStats[k] = (newStats[k] ?? 0) + (delta ?? 0);
      }

      const inserted = await tx
        .insert(xpEventsTable)
        .values({
          userId,
          sourceType: rule.sourceType,
          sourceId: sourceId ?? null,
          sourceKey,
          eventType: rule.eventType,
          expDelta: rule.xp,
          statChanges: rule.stats,
          reason: reason ?? rule.reason,
          metadata: metadata ?? null,
          beforeLevel,
          afterLevel,
          beforeExp,
          afterExp,
        })
        .onConflictDoNothing({ target: xpEventsTable.sourceKey })
        .returning({ id: xpEventsTable.id });

      // Duplicate activity (sourceKey already recorded) — grant nothing twice.
      if (inserted.length === 0) return;

      await tx
        .update(personasTable)
        .set({ xp: afterExp, stats: newStats, level: afterLevel })
        .where(eq(personasTable.userId, userId));
      granted = true;
    });

    // Clan growth is a side effect of individual growth: it runs in its OWN
    // transaction AFTER the persona update has committed, and only when this was a
    // genuinely new (non-duplicate) grant. Doing it separately guarantees a clan-
    // side failure can never roll back or block the user's persona XP. awardClanExp
    // itself swallows its errors, so this never affects core flows.
    if (granted) {
      await awardClanExp(userId, clanExpForGrowth(kind, rule.xp), log);
    }
  } catch (err) {
    log.error({ err, userId, kind }, "recordActivity failed");
  }
}

/** The seven persona stat keys a Life Quest choice may move. */
const LIFE_QUEST_STAT_KEYS: (keyof PersonaStats)[] = [
  "logic",
  "empathy",
  "wit",
  "knowledge",
  "conviction",
  "emotion",
  "decisiveness",
];

export interface RecordLifeQuestActivityParams {
  userId: string;
  /** `life_quest_action` per-stage choice, `life_quest_complete` on finish, `life_quest_abandon` on give-up. */
  eventType: Extract<
    GrowthEventType,
    "life_quest_action" | "life_quest_complete" | "life_quest_abandon"
  >;
  /** Deterministic idempotency key, e.g. `life_quest_action:{questId}:{stageNumber}:{userId}`. */
  sourceKey: string;
  /** Opaque source pointer (quest id). */
  sourceId?: string | null;
  /** Flat Persona EXP to grant (must be > 0). */
  xp: number;
  /** Caller-supplied per-stat deltas (only the seven persona stats are applied). */
  stats?: Partial<PersonaStats>;
  reason: string;
  metadata?: Record<string, unknown>;
  log?: Logger;
}

export interface LifeQuestGrantResult {
  /** True iff this call actually granted (a replayed sourceKey returns false). */
  granted: boolean;
  /** The stat deltas that were actually applied (empty when not granted). */
  appliedStats: Partial<PersonaStats>;
}

/**
 * Record a Life Quest growth event with caller-supplied XP and per-choice stat
 * deltas. Unlike {@link recordActivity} (which derives a fixed payout from a
 * {@link GrowthKind} rule), Life Quest payouts are dynamic — the AI-authored
 * choice decides the stats — so this is its own entry point and never touches
 * `GrowthKind`/`GROWTH_RULES`.
 *
 * It mirrors recordActivity's idempotency/atomicity exactly: persona row locked
 * `FOR UPDATE`, xp_event inserted with `ON CONFLICT (source_key) DO NOTHING`, and
 * the persona bumped only when the insert produced a row. Clan EXP (base 30% +
 * a flat completion bonus) is awarded fire-and-forget in its own transaction
 * AFTER commit, only for a genuinely new grant. Always stored under the kept
 * `dungeon` sourceType so existing source-based aggregations keep working.
 *
 * Returns whether it granted plus the stats applied, so the route can echo the
 * real deltas back to the client. It NEVER throws — Life Quest growth can never
 * break the play flow.
 */
export async function recordLifeQuestActivity(
  params: RecordLifeQuestActivityParams,
): Promise<LifeQuestGrantResult> {
  const { userId, eventType, sourceKey, sourceId, xp, stats, reason, metadata } = params;
  const log = params.log ?? defaultLogger;
  const empty: LifeQuestGrantResult = { granted: false, appliedStats: {} };
  try {
    if (xp <= 0) return empty;

    // Keep only the seven known persona-stat keys with a non-zero integer delta.
    const cleanStats: Partial<PersonaStats> = {};
    for (const k of LIFE_QUEST_STAT_KEYS) {
      const v = stats?.[k];
      if (typeof v === "number" && Number.isFinite(v) && v !== 0) {
        cleanStats[k] = Math.trunc(v);
      }
    }

    const ensured = await ensurePersona(userId);
    if (!ensured) return empty;

    let granted = false;
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(personasTable)
        .where(eq(personasTable.userId, userId))
        .for("update");
      if (!locked) return;

      const beforeExp = locked.xp;
      const beforeLevel = locked.level;
      const afterExp = beforeExp + xp;
      const afterLevel = computeLevel(afterExp);
      const newStats: PersonaStats = { ...DEFAULT_PERSONA_STATS, ...locked.stats };
      for (const [key, delta] of Object.entries(cleanStats)) {
        const k = key as keyof PersonaStats;
        newStats[k] = (newStats[k] ?? 0) + (delta ?? 0);
      }

      const inserted = await tx
        .insert(xpEventsTable)
        .values({
          userId,
          sourceType: "dungeon",
          sourceId: sourceId ?? null,
          sourceKey,
          eventType,
          expDelta: xp,
          statChanges: cleanStats,
          reason,
          metadata: metadata ?? null,
          beforeLevel,
          afterLevel,
          beforeExp,
          afterExp,
        })
        .onConflictDoNothing({ target: xpEventsTable.sourceKey })
        .returning({ id: xpEventsTable.id });

      if (inserted.length === 0) return;

      await tx
        .update(personasTable)
        .set({ xp: afterExp, stats: newStats, level: afterLevel })
        .where(eq(personasTable.userId, userId));
      granted = true;
    });

    if (granted) {
      // Mirror clanExpForGrowth: base 30% of XP, plus a flat completion bonus to
      // match the dungeon_goal milestone. Computed inline so we never have to add
      // Life Quest kinds to GrowthKind / CLAN_KIND_BONUS.
      const bonus = eventType === "life_quest_complete" ? 30 : 0;
      const clanExp = Math.round(xp * CLAN_BASE_RATE) + bonus;
      await awardClanExp(userId, clanExp, log);
    }

    return { granted, appliedStats: granted ? cleanStats : {} };
  } catch (err) {
    log.error({ err, userId, eventType }, "recordLifeQuestActivity failed");
    return empty;
  }
}

export interface RecordRewardParams {
  userId: string;
  /** "quest" | "achievement" — keeps reward grants distinct from core activity. */
  sourceType: Extract<GrowthSourceType, "quest" | "achievement">;
  eventType: Extract<GrowthEventType, "quest_reward" | "achievement_reward">;
  /** Deterministic idempotency key, e.g. `quest:{periodKey}:{questKey}:{userId}`. */
  sourceKey: string;
  /** Flat Persona EXP reward. Must be > 0 to grant. */
  expDelta: number;
  reason: string;
  metadata?: Record<string, unknown>;
  log?: Logger;
}

/**
 * Grant a flat Persona EXP reward for a claimed quest / achievement. This is a
 * sibling of {@link recordActivity} that grants ONLY XP (no stat changes) and,
 * crucially, never touches Clan EXP — rewards are a self-contained retention
 * layer on top of growth, not new clan activity.
 *
 * Idempotency + atomicity match recordActivity exactly: the persona row is locked
 * `FOR UPDATE`, the xp_event is inserted with `ON CONFLICT (source_key) DO NOTHING`,
 * and the persona is bumped only when the insert produced a row. Returns `true`
 * iff this call actually granted (a replay of the same sourceKey returns `false`),
 * so callers can decide whether to mark the reward claimed.
 *
 * Unlike recordActivity (fire-and-forget), this rethrows on unexpected DB errors
 * so a claim endpoint can surface a real failure to the user rather than silently
 * marking a reward claimed without granting it.
 */
export async function recordReward(params: RecordRewardParams): Promise<boolean> {
  const { userId, sourceType, eventType, sourceKey, expDelta, reason, metadata } = params;
  if (expDelta <= 0) return false;

  const ensured = await ensurePersona(userId);
  if (!ensured) throw new Error("persona unavailable for reward");

  let granted = false;
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(personasTable)
      .where(eq(personasTable.userId, userId))
      .for("update");
    if (!locked) return;

    const beforeExp = locked.xp;
    const beforeLevel = locked.level;
    const afterExp = beforeExp + expDelta;
    const afterLevel = computeLevel(afterExp);

    const inserted = await tx
      .insert(xpEventsTable)
      .values({
        userId,
        sourceType,
        sourceId: null,
        sourceKey,
        eventType,
        expDelta,
        statChanges: {},
        reason,
        metadata: metadata ?? null,
        beforeLevel,
        afterLevel,
        beforeExp,
        afterExp,
      })
      .onConflictDoNothing({ target: xpEventsTable.sourceKey })
      .returning({ id: xpEventsTable.id });

    if (inserted.length === 0) return;

    await tx
      .update(personasTable)
      .set({ xp: afterExp, level: afterLevel })
      .where(eq(personasTable.userId, userId));
    granted = true;
  });

  return granted;
}
