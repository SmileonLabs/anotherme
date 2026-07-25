import {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod/v4";
import { requireAuth } from "../lib/auth";
import { rateLimit } from "../lib/rateLimit";
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

async function dailyTalkGenerationPreflight(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.dbUser!.id;
    const status = await getDailyTalkRewardStatus(userId);

    // A completed draft is idempotent and does not need another AI request.
    if (status.rewardId && status.status === "GENERATED") {
      res.json(await getDailyTalkReward(userId, status.rewardId));
      return;
    }
    if (status.claimedToday) {
      throw new DailyTalkRewardError(
        "already_claimed",
        "오늘은 이미 Talk to Earn 보상을 받았어요.",
      );
    }
    if (status.reason === "analysis_disabled") {
      throw new DailyTalkRewardError(
        "analysis_disabled",
        "Talk to Earn 대화 분석이 꺼져 있어요.",
      );
    }
    if (
      status.reason === "insufficient_messages" ||
      status.reason === "insufficient_counterparts"
    ) {
      throw new DailyTalkRewardError(
        "insufficient_messages",
        status.reason === "insufficient_counterparts"
          ? "오늘 다른 사용자와 나눈 대화가 필요해요."
          : "분석할 수 있는 오늘의 대화가 아직 부족해요.",
        {
          messageCount: status.messageCount,
          minMessageCount: status.minMessageCount,
        },
      );
    }

    next();
  } catch (err) {
    if (err instanceof DailyTalkRewardError) {
      sendDailyTalkError(res, err);
      return;
    }
    next(err);
  }
}

router.get("/daily-talk-reward/status", requireAuth, async (req, res): Promise<void> => {
  res.json(await getDailyTalkRewardStatus(req.dbUser!.id));
});

router.post(
  "/daily-talk-reward/generate",
  requireAuth,
  dailyTalkGenerationPreflight,
  rateLimit({
    name: "daily-talk-ai-generate-minute",
    limit: 3,
    windowSeconds: 60,
    requireRedis: true,
  }),
  rateLimit({
    name: "daily-talk-ai-generate-daily",
    limit: 5,
    windowSeconds: 86400,
    requireRedis: true,
  }),
  async (req, res): Promise<void> => {
    try {
      res.json(await generateDailyTalkReward(req.dbUser!.id, req.log));
    } catch (err) {
      req.log.error({ err }, "Daily talk reward generate failed");
      sendDailyTalkError(res, err);
    }
  },
);

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
