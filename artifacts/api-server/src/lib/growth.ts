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
import { awardClanExp, clanExpForGrowth } from "./clanGrowth";

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
