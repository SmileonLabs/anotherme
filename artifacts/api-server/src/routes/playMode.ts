import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import { ensurePlayModeState, setPlayMode } from "../lib/fanStar";
import type { PlayMode } from "@workspace/db";

const router: IRouter = Router();

function isPlayMode(value: unknown): value is PlayMode {
  return value === "fan" || value === "star";
}

router.get("/users/me/play-mode", requireAuth, async (req, res): Promise<void> => {
  const state = await ensurePlayModeState(req.dbUser!.id);
  res.json(state);
});

router.patch("/users/me/play-mode", requireAuth, async (req, res): Promise<void> => {
  const mode = req.body?.mode;
  if (!isPlayMode(mode)) {
    res.status(400).json({ error: "mode must be fan or star" });
    return;
  }

  try {
    res.json(await setPlayMode(req.dbUser!.id, mode));
  } catch (err) {
    if ((err as Error & { code?: string }).code === "STAR_LOCKED") {
      res.status(403).json({
        error: "STAR_LOCKED",
        message: "STAR NFT 보유자만 STAR 모드를 이용할 수 있어요.",
        state: await ensurePlayModeState(req.dbUser!.id),
      });
      return;
    }
    throw err;
  }
});

export default router;
