import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import { ensurePersona, levelProgress } from "../lib/growth";

const router: IRouter = Router();

router.get("/users/me/persona", requireAuth, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  const persona = await ensurePersona(user.id);
  if (!persona) {
    res.status(500).json({ error: "Failed to load persona" });
    return;
  }

  const progress = levelProgress(persona.xp);
  res.json({
    id: persona.id,
    userId: persona.userId,
    level: progress.level,
    xp: persona.xp,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNextLevel: progress.xpForNextLevel,
    stats: persona.stats,
    summary: persona.summary ?? null,
    lastAnalyzedAt: persona.lastAnalyzedAt ? persona.lastAnalyzedAt.toISOString() : null,
    createdAt: persona.createdAt.toISOString(),
  });
});

export default router;
