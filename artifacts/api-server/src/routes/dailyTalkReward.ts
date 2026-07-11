import { Router, type IRouter, type Response } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../lib/auth";
import {
  DailyTalkRewardError,
  generateDailyTalkReward,
  getDailyTalkReward,
  getDailyTalkRewardStatus,
  listDailyTalkRewardHistory,
  postDailyTalkRewardToFeed,
  saveDailyTalkReward,
  updateDailyTalkReward,
} from "../lib/dailyTalkReward";

const router: IRouter = Router();

const visibilitySchema = z.enum(["PRIVATE", "FRIENDS", "PUBLIC"]);

const updateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  diary: z.string().trim().min(1).max(1200).optional(),
  visibility: visibilitySchema.optional(),
});

function sendDailyTalkError(res: Response, err: unknown): void {
  if (!(err instanceof DailyTalkRewardError)) {
    res.status(500).json({ error: "internal", message: "톡 리워드 처리 중 오류가 발생했어요." });
    return;
  }

  switch (err.code) {
    case "analysis_disabled":
      res.status(403).json({ error: err.code, message: err.message });
      return;
    case "already_claimed":
      res.status(409).json({ error: err.code, message: err.message });
      return;
    case "insufficient_messages":
      res.status(409).json({ error: err.code, message: err.message, ...err.details });
      return;
    case "not_found":
      res.status(404).json({ error: err.code, message: err.message });
      return;
    case "not_ready":
    case "invalid":
      res.status(400).json({ error: err.code, message: err.message });
      return;
    case "no_api_key":
    case "ai_failed":
      res.status(503).json({ error: err.code, message: err.message });
      return;
  }
}

router.get("/daily-talk-reward/status", requireAuth, async (req, res): Promise<void> => {
  res.json(await getDailyTalkRewardStatus(req.dbUser!.id));
});

router.post("/daily-talk-reward/generate", requireAuth, async (req, res): Promise<void> => {
  try {
    res.json(await generateDailyTalkReward(req.dbUser!.id, req.log));
  } catch (err) {
    req.log.error({ err }, "Daily talk reward generate failed");
    sendDailyTalkError(res, err);
  }
});

router.get("/daily-talk-reward/history", requireAuth, async (req, res): Promise<void> => {
  res.json(await listDailyTalkRewardHistory(req.dbUser!.id));
});

router.patch("/daily-talk-reward/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "일기 내용을 확인해 주세요." });
    return;
  }
  try {
    res.json(await updateDailyTalkReward(req.dbUser!.id, String(req.params.id), parsed.data));
  } catch (err) {
    sendDailyTalkError(res, err);
  }
});

router.get("/daily-talk-reward/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    res.json(await getDailyTalkReward(req.dbUser!.id, String(req.params.id)));
  } catch (err) {
    sendDailyTalkError(res, err);
  }
});

router.post("/daily-talk-reward/:id/save", requireAuth, async (req, res): Promise<void> => {
  try {
    res.json(await saveDailyTalkReward(req.dbUser!.id, String(req.params.id), req.log));
  } catch (err) {
    sendDailyTalkError(res, err);
  }
});

router.post("/daily-talk-reward/:id/post-to-feed", requireAuth, async (req, res): Promise<void> => {
  try {
    res.json(await postDailyTalkRewardToFeed(req.dbUser!.id, String(req.params.id), req.log));
  } catch (err) {
    sendDailyTalkError(res, err);
  }
});

export default router;
