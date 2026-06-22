import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  lifeQuestsTable,
  type LifeQuest,
  type LifeQuestStage,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { generateLifeQuestScenario, normalizeTheme } from "../lib/lifeQuest";
import { recordLifeQuestActivity } from "../lib/growth";

const router: IRouter = Router();

/** XP payouts (kept small per choice, meaningful on completion). */
const XP_PER_CHOICE = 2;
const XP_ON_COMPLETE = 50;
const XP_ON_ABANDON = 10;

// Start a new Life Quest. The AI authors the ENTIRE scenario in one call here;
// the rest of the run never calls AI. Generation failures persist nothing and
// surface a 502 so the client can retry.
router.post("/life-quests", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const { theme: rawTheme } = (req.body ?? {}) as { theme?: string | null };
  const theme = normalizeTheme(rawTheme);

  let scenario;
  try {
    scenario = await generateLifeQuestScenario(theme, req.log);
  } catch (err) {
    req.log.error({ err, theme }, "Life Quest generation failed");
    res.status(502).json({ error: "라이프 퀘스트를 생성하지 못했어요. 잠시 후 다시 시도해주세요." });
    return;
  }

  if (scenario.stages.length === 0) {
    res.status(502).json({ error: "라이프 퀘스트 시나리오가 비어 있어요. 다시 시도해주세요." });
    return;
  }

  const [created] = await db
    .insert(lifeQuestsTable)
    .values({
      userId,
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
  const [active] = await db
    .select()
    .from(lifeQuestsTable)
    .where(and(eq(lifeQuestsTable.userId, userId), eq(lifeQuestsTable.status, "active")))
    .orderBy(desc(lifeQuestsTable.createdAt))
    .limit(1);
  res.json({ quest: active ?? null });
});

// Fetch a single Life Quest the caller owns.
router.get("/life-quests/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const quest = await loadOwnedQuest(id, userId);
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
      .where(and(eq(lifeQuestsTable.id, id), eq(lifeQuestsTable.userId, userId)))
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
  const actionGrant = await recordLifeQuestActivity({
    userId,
    eventType: "life_quest_action",
    sourceKey: `life_quest_action:${id}:${stageNumber}:${userId}`,
    sourceId: id,
    xp: XP_PER_CHOICE,
    stats: outcome.statChanges,
    reason: "라이프 퀘스트 선택",
    metadata: { questId: id, stageNumber, choiceId },
    log: req.log,
  });

  let expEarned = actionGrant.granted ? XP_PER_CHOICE : 0;
  if (outcome.completed) {
    const completeGrant = await recordLifeQuestActivity({
      userId,
      eventType: "life_quest_complete",
      sourceKey: `life_quest_complete:${id}:${userId}`,
      sourceId: id,
      xp: XP_ON_COMPLETE,
      reason: "라이프 퀘스트 완료",
      metadata: { questId: id },
      log: req.log,
    });
    if (completeGrant.granted) expEarned += XP_ON_COMPLETE;
  }

  res.json({
    quest: outcome.quest,
    resultText: outcome.resultText,
    statChanges: actionGrant.appliedStats,
    expEarned,
    completed: outcome.completed,
  });
});

// Give up on an active quest. Marks it failed and grants a small consolation XP.
router.post("/life-quests/:id/abandon", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [updated] = await db
    .update(lifeQuestsTable)
    .set({ status: "failed", completedAt: new Date() })
    .where(
      and(
        eq(lifeQuestsTable.id, id),
        eq(lifeQuestsTable.userId, userId),
        eq(lifeQuestsTable.status, "active"),
      ),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found or already ended" });
    return;
  }

  await recordLifeQuestActivity({
    userId,
    eventType: "life_quest_abandon",
    sourceKey: `life_quest_abandon:${id}:${userId}`,
    sourceId: id,
    xp: XP_ON_ABANDON,
    reason: "라이프 퀘스트 중도 종료",
    metadata: { questId: id, abandoned: true },
    log: req.log,
  });

  res.json(updated);
});

async function loadOwnedQuest(id: string, userId: string): Promise<LifeQuest | undefined> {
  const [quest] = await db
    .select()
    .from(lifeQuestsTable)
    .where(and(eq(lifeQuestsTable.id, id), eq(lifeQuestsTable.userId, userId)));
  return quest;
}

export default router;
