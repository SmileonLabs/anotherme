import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import { db } from "@workspace/db";
import {
  DEFAULT_PERSONA_STATS,
  personasTable,
  xpEventsTable,
  type Persona,
  type PersonaStats,
  type XpSourceType,
} from "@workspace/db";
import { logger as defaultLogger } from "./logger";

/**
 * Deterministic growth rules. Each activity grants a fixed amount of XP and a
 * small set of stat increases — no AI, no cost. Tuned so that frequent-but-cheap
 * actions (chat) grant little, and rare-but-meaningful ones (battle win, dungeon
 * goal) grant a lot.
 */
const GROWTH_CONFIG: Record<XpSourceType, { xp: number; stats: Partial<PersonaStats> }> = {
  chat_message: { xp: 2, stats: { empathy: 1 } },
  battle_turn: { xp: 5, stats: { logic: 1, wit: 1 } },
  battle_win: { xp: 30, stats: { conviction: 2, logic: 1 } },
  battle_loss: { xp: 10, stats: { emotion: 1 } },
  battle_draw: { xp: 15, stats: { conviction: 1, emotion: 1 } },
  dungeon_turn: { xp: 4, stats: { decisiveness: 1 } },
  dungeon_goal: { xp: 20, stats: { knowledge: 2, decisiveness: 1 } },
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

/**
 * Record a single growth event and apply it to the user's persona. This is the
 * one entry point existing features call. It NEVER throws — any failure is
 * logged and swallowed so growth tracking can never break a core action. Callers
 * may safely fire-and-forget it.
 */
export async function recordActivity(
  userId: string,
  sourceType: XpSourceType,
  opts?: { refId?: string | null; log?: Logger },
): Promise<void> {
  const log = opts?.log ?? defaultLogger;
  try {
    const cfg = GROWTH_CONFIG[sourceType];
    if (!cfg) return;

    // Make sure the persona exists before we try to lock it.
    const ensured = await ensurePersona(userId);
    if (!ensured) return;

    // Apply the event and the persona increment atomically. We lock the persona
    // row (`FOR UPDATE`) so concurrent events for the same user serialize instead
    // of racing on a stale read-modify-write (which would drop XP/stat gains).
    // Logging the event and bumping the persona share one transaction so the
    // append-only log and the rolled-up totals can never diverge.
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(personasTable)
        .where(eq(personasTable.userId, userId))
        .for("update");
      if (!locked) return;

      await tx.insert(xpEventsTable).values({
        userId,
        sourceType,
        xpAmount: cfg.xp,
        statDeltas: cfg.stats,
        refId: opts?.refId ?? null,
      });

      const newXp = locked.xp + cfg.xp;
      const newStats: PersonaStats = { ...DEFAULT_PERSONA_STATS, ...locked.stats };
      for (const [key, delta] of Object.entries(cfg.stats)) {
        const k = key as keyof PersonaStats;
        newStats[k] = (newStats[k] ?? 0) + (delta ?? 0);
      }
      const newLevel = computeLevel(newXp);

      await tx
        .update(personasTable)
        .set({ xp: newXp, stats: newStats, level: newLevel })
        .where(eq(personasTable.userId, userId));
    });
  } catch (err) {
    log.error({ err, userId, sourceType }, "recordActivity failed");
  }
}
