import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import {
  claimAchievement,
  claimQuest,
  getAchievements,
  getQuests,
  getRewardsSummary,
  type ClaimResult,
} from "../lib/quests";

const router: IRouter = Router();

/** Map a failed claim result to an HTTP response. */
function sendClaimError(res: import("express").Response, result: ClaimResult & { ok: false }): void {
  switch (result.code) {
    case "not_found":
      res.status(404).json({ error: "not_found", message: "존재하지 않는 보상이에요." });
      return;
    case "not_completed":
      res.status(409).json({
        error: "not_completed",
        message: "아직 완료되지 않았어요.",
      });
      return;
    case "already_claimed":
      res.status(409).json({
        error: "already_claimed",
        message: "이미 받은 보상이에요.",
      });
      return;
  }
}

router.get("/users/me/quests", requireAuth, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  res.json(await getQuests(user.id));
});

router.post(
  "/users/me/quests/:questKey/claim",
  requireAuth,
  async (req, res): Promise<void> => {
    const user = req.dbUser!;
    const result = await claimQuest(user.id, String(req.params.questKey));
    if (result.ok) {
      res.json({ ok: true, rewardExp: result.rewardExp });
      return;
    }
    sendClaimError(res, result);
  },
);

router.get("/users/me/achievements", requireAuth, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  res.json(await getAchievements(user.id));
});

router.post(
  "/users/me/achievements/:achievementKey/claim",
  requireAuth,
  async (req, res): Promise<void> => {
    const user = req.dbUser!;
    const result = await claimAchievement(user.id, String(req.params.achievementKey));
    if (result.ok) {
      res.json({ ok: true, rewardExp: result.rewardExp });
      return;
    }
    sendClaimError(res, result);
  },
);

router.get("/users/me/rewards/summary", requireAuth, async (req, res): Promise<void> => {
  const user = req.dbUser!;
  res.json(await getRewardsSummary(user.id));
});

export default router;
