import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import { ensurePersona, levelProgress, recentGrowthEvents } from "../lib/growth";
import { analyzePersona } from "../lib/personaAnalysis";
import type { Persona } from "@workspace/db";

const router: IRouter = Router();

/** Serialize a persona (+ derived level progress + recent events) for the API. */
async function serializePersona(persona: Persona) {
  const progress = levelProgress(persona.xp);
  const events = await recentGrowthEvents(persona.userId, 20);
  return {
    id: persona.id,
    userId: persona.userId,
    level: progress.level,
    xp: persona.xp,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNextLevel: progress.xpForNextLevel,
    stats: persona.stats,
    recentEvents: events.map((e) => ({
      id: e.id,
      sourceType: e.sourceType,
      eventType: e.eventType,
      sourceId: e.sourceId ?? null,
      expDelta: e.expDelta,
      statChanges: e.statChanges ?? {},
      reason: e.reason ?? null,
      beforeLevel: e.beforeLevel,
      afterLevel: e.afterLevel,
      beforeExp: e.beforeExp,
      afterExp: e.afterExp,
      createdAt: e.createdAt.toISOString(),
    })),
    summary: persona.summary ?? null,
    languageStyle: persona.languageStyle ?? null,
    personalityTraits: persona.personalityTraits ?? null,
    valuesBeliefs: persona.valuesBeliefs ?? null,
    knowledgeDomains: persona.knowledgeDomains ?? null,
    emotionalPatterns: persona.emotionalPatterns ?? null,
    decisionStyle: persona.decisionStyle ?? null,
    analysisConfidence: persona.analysisMetadata?.confidence ?? null,
    lastAnalyzedAt: persona.lastAnalyzedAt ? persona.lastAnalyzedAt.toISOString() : null,
    createdAt: persona.createdAt.toISOString(),
  };
}

router.get("/users/me/persona", requireAuth, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const persona = await ensurePersona(user.id);
  if (!persona) {
    res.status(500).json({ error: "Failed to load persona" });
    return;
  }
  res.json(await serializePersona(persona));
});

/**
 * On-demand AI analysis. Triggered only by the user pressing "분석 업데이트".
 * Enforces a 10-minute cooldown and degrades gracefully: a missing API key, too
 * little activity, or an AI failure each return a friendly Korean message
 * without ever mutating the existing persona analysis.
 */
router.post("/users/me/persona/analyze", requireAuth, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const outcome = await analyzePersona(user.id, req.log);

  if (outcome.ok) {
    res.json(await serializePersona(outcome.persona));
    return;
  }

  switch (outcome.code) {
    case "cooldown":
      res.status(429).json({
        error: "cooldown",
        retryAfterSec: outcome.retryAfterSec,
        message: `분석은 10분에 한 번만 할 수 있어요. 약 ${Math.ceil(
          outcome.retryAfterSec / 60,
        )}분 후에 다시 시도해 주세요.`,
      });
      return;
    case "no_api_key":
      res.status(503).json({
        error: "no_api_key",
        message: "지금은 AI 분석을 사용할 수 없어요. 잠시 후 다시 시도해 주세요.",
      });
      return;
    case "insufficient_data":
      res.status(422).json({
        error: "insufficient_data",
        message: "분석할 활동이 아직 부족해요. 채팅·배틀·던전으로 조금 더 활동해 보세요.",
      });
      return;
    case "ai_failed":
    default:
      res.status(502).json({
        error: "ai_failed",
        message: "분석에 실패했어요. 잠시 후 다시 시도해 주세요.",
      });
      return;
  }
});

export default router;
