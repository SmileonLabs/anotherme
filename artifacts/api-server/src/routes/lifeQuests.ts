import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, nftCollectionsTable } from "@workspace/db";
import {
  lifeQuestsTable,
  type LifeQuest,
  type LifeQuestStage,
  type StarStats,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { rateLimit } from "../lib/rateLimit";
import { generateLifeQuestScenario, normalizeTheme } from "../lib/lifeQuest";
import { ensurePlayModeState, type PlayModeState } from "../lib/fanStar";
import { getTorimiaState, type TorimiaState } from "../lib/torimia";
import { ensureActiveStarOwnership, recordStarActivity, StarProfileError } from "../lib/starProfiles";
import { normalizeNftRpgMissions } from "../lib/nftRpgContent";

const router: IRouter = Router();

/** XP payouts (kept small per choice, meaningful on completion). */
const XP_PER_CHOICE = 5;
const XP_ON_COMPLETE = 80;
const XP_ON_ABANDON = 10;

type StarMissionAccess =
  | { ok: true; state: PlayModeState; torimia: TorimiaState }
  | { ok: false; status: number; error: string; message: string; state: PlayModeState };

async function requireStarMissionAccess(userId: string): Promise<StarMissionAccess> {
  const state = await ensurePlayModeState(userId);
  if (!state.starUnlocked) {
    return {
      ok: false,
      status: 403,
      error: "STAR_LOCKED",
      message: "STAR NFT를 장착한 뒤 미션을 시작할 수 있어요.",
      state,
    };
  }
  if (!state.equippedStar) {
    return {
      ok: false,
      status: 409,
      error: "STAR_NOT_EQUIPPED",
      message: "미션을 진행하려면 먼저 STAR NFT를 장착해 주세요.",
      state,
    };
  }
  if (state.currentMode !== "star") {
    return {
      ok: false,
      status: 409,
      error: "STAR_MODE_REQUIRED",
      message: "미션은 STAR 모드에서만 진행할 수 있어요.",
      state,
    };
  }
  try {
    await ensureActiveStarOwnership({
      userId,
      starProfileId: state.equippedStar.id,
    });
  } catch (error) {
    const refreshed = await ensurePlayModeState(userId);
    const unavailable = error instanceof StarProfileError && error.code === "nft_check_failed";
    return {
      ok: false,
      status: unavailable ? 503 : 409,
      error: unavailable ? "NFT_OWNERSHIP_CHECK_FAILED" : "NFT_OWNERSHIP_REQUIRED",
      message: error instanceof Error ? error.message : "NFT 소유권을 다시 확인해 주세요.",
      state: refreshed,
    };
  }
  return { ok: true, state, torimia: await getTorimiaState(userId) };
}

function sendStarMissionAccessError(
  res: import("express").Response,
  access: StarMissionAccess & { ok: false },
): void {
  res.status(access.status).json({
    error: access.error,
    message: access.message,
    state: access.state,
  });
}

function cleanStarStats(stats: Record<string, number>): Partial<StarStats> {
  const out: Partial<StarStats> = {};
  for (const key of ["charm", "stagePresence", "bond", "lore"] as const) {
    const value = stats[key];
    if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
      out[key] = Math.trunc(value);
    }
  }
  return out;
}

// Start a new Life Quest. The AI authors the ENTIRE scenario in one call here;
// the rest of the run never calls AI. Generation failures persist nothing and
// surface a 502 so the client can retry.
router.post("/life-quests", requireAuth, rateLimit({ name: "create-life-quest", limit: 20, windowSeconds: 86400, requireRedis: true }), async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const access = await requireStarMissionAccess(userId);
  if (!access.ok) {
    sendStarMissionAccessError(res, access);
    return;
  }

  const { theme: rawTheme } = (req.body ?? {}) as { theme?: string | null };
  const theme = normalizeTheme(rawTheme);
  const collectionId = access.state.equippedStar!.collectionId;
  const [collection] = collectionId
    ? await db.select().from(nftCollectionsTable)
      .where(and(eq(nftCollectionsTable.id, collectionId), eq(nftCollectionsTable.status, "published")))
      .limit(1)
    : [];

  let scenario;
  try {
    scenario = await generateLifeQuestScenario(theme, req.log, {
      starName: access.state.equippedStar?.displayName,
      promoted: access.torimia.promoted,
      ipName: collection?.ipName,
      category: collection?.category ?? access.state.equippedStar?.category,
      roleName: collection?.roleName,
      worldStyle: collection?.worldStyle,
      missions: collection ? normalizeNftRpgMissions(collection) : [],
    });
  } catch (err) {
    req.log.error({ err, theme }, "Life Quest generation failed");
    res.status(502).json({ error: "STAR 미션을 생성하지 못했어요. 잠시 후 다시 시도해주세요." });
    return;
  }

  if (scenario.stages.length === 0) {
    res.status(502).json({ error: "STAR 미션 시나리오가 비어 있어요. 다시 시도해주세요." });
    return;
  }

  const [created] = await db
    .insert(lifeQuestsTable)
    .values({
      userId,
      starProfileId: access.state.equippedStar!.id,
      title: scenario.title,
      theme: scenario.theme,
      goal: scenario.goal,
      summary: scenario.summary,
      currentStageIndex: 0,
      status: "active",
      stages: scenario.stages,
    })
    .returning();

  res.status(201).json(created);
});

// The caller's most recent active Life Quest (or null) — powers the "continue"
// card on the lobby.
router.get("/life-quests/active", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const access = await requireStarMissionAccess(userId);
  if (!access.ok) {
    sendStarMissionAccessError(res, access);
    return;
  }

  const [active] = await db
    .select()
    .from(lifeQuestsTable)
    .where(
      and(
        eq(lifeQuestsTable.userId, userId),
        eq(lifeQuestsTable.starProfileId, access.state.equippedStar!.id),
        eq(lifeQuestsTable.status, "active"),
      ),
    )
    .orderBy(desc(lifeQuestsTable.createdAt))
    .limit(1);
  res.json({ quest: active ?? null });
});

// Fetch a single Life Quest the caller owns.
router.get("/life-quests/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const access = await requireStarMissionAccess(userId);
  if (!access.ok) {
    sendStarMissionAccessError(res, access);
    return;
  }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const quest = await loadOwnedQuest(id, userId, access.state.equippedStar!.id);
  if (!quest) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(quest);
});

// Pick a choice for the current stage. Applies the choice's pre-generated stat
// changes + XP and advances the quest. No AI is involved. The quest row is locked
// FOR UPDATE so a double-tap can't advance twice, and XP grants are idempotent
// via deterministic source keys.
router.post("/life-quests/:id/choose", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const access = await requireStarMissionAccess(userId);
  if (!access.ok) {
    sendStarMissionAccessError(res, access);
    return;
  }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { stageNumber, choiceId } = (req.body ?? {}) as {
    stageNumber?: unknown;
    choiceId?: unknown;
  };

  if (typeof stageNumber !== "number" || !Number.isInteger(stageNumber) || typeof choiceId !== "string") {
    res.status(400).json({ error: "stageNumber and choiceId are required" });
    return;
  }

  // Validate + advance inside a transaction on the locked quest row.
  let outcome:
    | { ok: false; status: number; error: string }
    | {
        ok: true;
        quest: LifeQuest;
        resultText: string;
        statChanges: Record<string, number>;
        completed: boolean;
      };

  outcome = await db.transaction(async (tx) => {
    const [quest] = await tx
      .select()
      .from(lifeQuestsTable)
      .where(
        and(
          eq(lifeQuestsTable.id, id),
          eq(lifeQuestsTable.userId, userId),
          eq(lifeQuestsTable.starProfileId, access.state.equippedStar!.id),
        ),
      )
      .for("update");
    if (!quest) return { ok: false as const, status: 404, error: "Not found" };
    if (quest.status !== "active") {
      return { ok: false as const, status: 409, error: "이미 종료된 퀘스트예요." };
    }

    const stageIdx = quest.currentStageIndex;
    const expectedStageNumber = stageIdx + 1;
    if (stageNumber !== expectedStageNumber) {
      return { ok: false as const, status: 409, error: "현재 진행 중인 단계가 아니에요." };
    }

    const stages = quest.stages as LifeQuestStage[];
    const stage = stages[stageIdx];
    if (!stage || stage.chosenChoiceId) {
      return { ok: false as const, status: 409, error: "이미 선택한 단계예요." };
    }
    const chosen = stage.choices.find((c) => c.id === choiceId);
    if (!chosen) return { ok: false as const, status: 400, error: "선택지를 찾을 수 없어요." };

    const nextStages = stages.map((s, i) =>
      i === stageIdx ? { ...s, chosenChoiceId: chosen.id } : s,
    );
    const nextIndex = stageIdx + 1;
    const completed = nextIndex >= stages.length;

    const [updated] = await tx
      .update(lifeQuestsTable)
      .set({
        stages: nextStages,
        currentStageIndex: nextIndex,
        status: completed ? "completed" : "active",
        completedAt: completed ? new Date() : null,
      })
      .where(eq(lifeQuestsTable.id, id))
      .returning();

    return {
      ok: true as const,
      quest: updated,
      resultText: chosen.resultText,
      statChanges: chosen.statChanges as Record<string, number>,
      completed,
    };
  });

  if (!outcome.ok) {
    res.status(outcome.status).json({ error: outcome.error });
    return;
  }

  // Grant growth AFTER the quest advance has committed. Both grants are
  // idempotent (deterministic source keys) and never throw.
  const actionStats = cleanStarStats(outcome.statChanges);
  const actionGranted = await recordStarActivity({
    userId,
    starProfileId: access.state.equippedStar!.id,
    eventType: "star_mission_action",
    sourceKey: `star_mission_action:${id}:${stageNumber}:${userId}`,
    xp: XP_PER_CHOICE,
    stats: actionStats,
    reason: "STAR 미션 선택",
    metadata: { questId: id, stageNumber, choiceId, starProfileId: access.state.equippedStar!.id },
  });

  let expEarned = actionGranted ? XP_PER_CHOICE : 0;
  if (outcome.completed) {
    const completeGranted = await recordStarActivity({
      userId,
      starProfileId: access.state.equippedStar!.id,
      eventType: "star_mission_complete",
      sourceKey: `star_mission_complete:${id}:${userId}`,
      xp: XP_ON_COMPLETE,
      stats: { charm: 1, stagePresence: 1, bond: 1, lore: 1 },
      reason: "STAR 미션 완료",
      metadata: { questId: id, starProfileId: access.state.equippedStar!.id },
    });
    if (completeGranted) expEarned += XP_ON_COMPLETE;
  }

  res.json({
    quest: outcome.quest,
    resultText: outcome.resultText,
    statChanges: actionGranted ? actionStats : {},
    expEarned,
    completed: outcome.completed,
  });
});

// Give up on an active quest. Marks it failed and grants a small consolation XP.
router.post("/life-quests/:id/abandon", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const access = await requireStarMissionAccess(userId);
  if (!access.ok) {
    sendStarMissionAccessError(res, access);
    return;
  }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [updated] = await db
    .update(lifeQuestsTable)
    .set({ status: "failed", completedAt: new Date() })
    .where(
      and(
        eq(lifeQuestsTable.id, id),
        eq(lifeQuestsTable.userId, userId),
        eq(lifeQuestsTable.starProfileId, access.state.equippedStar!.id),
        eq(lifeQuestsTable.status, "active"),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found or already ended" });
    return;
  }

  await recordStarActivity({
    userId,
    starProfileId: access.state.equippedStar!.id,
    eventType: "star_mission_abandon",
    sourceKey: `star_mission_abandon:${id}:${userId}`,
    xp: XP_ON_ABANDON,
    stats: { bond: 1 },
    reason: "STAR 미션 중도 종료",
    metadata: { questId: id, abandoned: true, starProfileId: access.state.equippedStar!.id },
  });

  res.json(updated);
});

async function loadOwnedQuest(id: string, userId: string, starProfileId: string): Promise<LifeQuest | undefined> {
  const [quest] = await db
    .select()
    .from(lifeQuestsTable)
    .where(
      and(
        eq(lifeQuestsTable.id, id),
        eq(lifeQuestsTable.userId, userId),
        eq(lifeQuestsTable.starProfileId, starProfileId),
      ),
    );
  return quest;
}

export default router;
