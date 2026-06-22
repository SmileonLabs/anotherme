import { Router, type IRouter, type Response } from "express";
import { z } from "zod/v4";
import { CLAN_WAR_STATUSES } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import {
  ClanWarError,
  WAR_SUBMISSION_MAX,
  WAR_SUBMISSION_MIN,
  WAR_TOPIC_MAX,
  WAR_TOPIC_MIN,
  acceptClanWar,
  cancelClanWar,
  completeClanWar,
  createClanWar,
  getClanWar,
  joinClanWar,
  listClanWars,
  submitClanWarArgument,
} from "../lib/clanWar";

const router: IRouter = Router();

/** Map a ClanWarError to an HTTP status + the (Korean) message it carries. */
function handleClanWarError(res: Response, err: unknown): boolean {
  if (err instanceof ClanWarError) {
    const status =
      err.code === "not_found"
        ? 404
        : err.code === "forbidden" || err.code === "not_member" || err.code === "no_clan"
          ? 403
          : err.code === "conflict"
            ? 409
            : err.code === "ai_failed"
              ? 502
              : 400;
    res.status(status).json({ error: err.code, message: err.message });
    return true;
  }
  return false;
}

const listQuerySchema = z.object({
  status: z.enum(CLAN_WAR_STATUSES).optional(),
});

/** GET /clan-wars — list open challenges + the caller's clan wars. */
router.get("/clan-wars", requireAuth, async (req, res): Promise<void> => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "잘못된 요청이에요." });
    return;
  }
  try {
    const wars = await listClanWars({ meUserId: req.dbUser!.id, status: parsed.data.status });
    res.json(wars);
  } catch (err) {
    if (handleClanWarError(res, err)) return;
    req.log.error({ err }, "listClanWars failed");
    res.status(500).json({ error: "internal", message: "가문전 목록을 불러오지 못했어요." });
  }
});

const createSchema = z.object({
  topic: z.string().min(WAR_TOPIC_MIN).max(WAR_TOPIC_MAX),
  opponentClanId: z.string().uuid().optional().nullable(),
});

/** POST /clan-wars — create a war (challenger owner/elder). */
router.post("/clan-wars", requireAuth, async (req, res): Promise<void> => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "주제를 올바르게 입력해 주세요." });
    return;
  }
  try {
    const war = await createClanWar({
      meUserId: req.dbUser!.id,
      topic: parsed.data.topic,
      opponentClanId: parsed.data.opponentClanId ?? null,
      log: req.log,
    });
    res.status(201).json(war);
  } catch (err) {
    if (handleClanWarError(res, err)) return;
    req.log.error({ err }, "createClanWar failed");
    res.status(500).json({ error: "internal", message: "가문전을 만들지 못했어요." });
  }
});

function warId(req: import("express").Request): string {
  return Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
}

/** GET /clan-wars/:id — war detail (PII/submission-safe). */
router.get("/clan-wars/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const war = await getClanWar({ warId: warId(req), meUserId: req.dbUser!.id });
    res.json(war);
  } catch (err) {
    if (handleClanWarError(res, err)) return;
    req.log.error({ err }, "getClanWar failed");
    res.status(500).json({ error: "internal", message: "가문전을 불러오지 못했어요." });
  }
});

/** POST /clan-wars/:id/accept — accept an open challenge (opponent owner/elder). */
router.post("/clan-wars/:id/accept", requireAuth, async (req, res): Promise<void> => {
  try {
    const war = await acceptClanWar({ warId: warId(req), meUserId: req.dbUser!.id, log: req.log });
    res.json(war);
  } catch (err) {
    if (handleClanWarError(res, err)) return;
    req.log.error({ err }, "acceptClanWar failed");
    res.status(500).json({ error: "internal", message: "도전을 수락하지 못했어요." });
  }
});

/** POST /clan-wars/:id/join — join as a member of a participating clan. */
router.post("/clan-wars/:id/join", requireAuth, async (req, res): Promise<void> => {
  try {
    const war = await joinClanWar({ warId: warId(req), meUserId: req.dbUser!.id });
    res.json(war);
  } catch (err) {
    if (handleClanWarError(res, err)) return;
    req.log.error({ err }, "joinClanWar failed");
    res.status(500).json({ error: "internal", message: "가문전에 참여하지 못했어요." });
  }
});

const submitSchema = z.object({
  content: z.string().min(WAR_SUBMISSION_MIN).max(WAR_SUBMISSION_MAX),
});

/** POST /clan-wars/:id/submit — submit a member's argument (once). */
router.post("/clan-wars/:id/submit", requireAuth, async (req, res): Promise<void> => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "주장을 올바르게 입력해 주세요." });
    return;
  }
  try {
    const war = await submitClanWarArgument({
      warId: warId(req),
      meUserId: req.dbUser!.id,
      content: parsed.data.content,
    });
    res.json(war);
  } catch (err) {
    if (handleClanWarError(res, err)) return;
    req.log.error({ err }, "submitClanWarArgument failed");
    res.status(500).json({ error: "internal", message: "주장을 제출하지 못했어요." });
  }
});

/** POST /clan-wars/:id/complete — judge & finalize (owner/elder of either clan). */
router.post("/clan-wars/:id/complete", requireAuth, async (req, res): Promise<void> => {
  try {
    const war = await completeClanWar({ warId: warId(req), meUserId: req.dbUser!.id, log: req.log });
    res.json(war);
  } catch (err) {
    if (handleClanWarError(res, err)) return;
    req.log.error({ err }, "completeClanWar failed");
    res.status(500).json({ error: "internal", message: "가문전을 종료하지 못했어요." });
  }
});

/** POST /clan-wars/:id/cancel — cancel before completion (challenger owner/elder). */
router.post("/clan-wars/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  try {
    const war = await cancelClanWar({ warId: warId(req), meUserId: req.dbUser!.id });
    res.json(war);
  } catch (err) {
    if (handleClanWarError(res, err)) return;
    req.log.error({ err }, "cancelClanWar failed");
    res.status(500).json({ error: "internal", message: "가문전을 취소하지 못했어요." });
  }
});

export default router;
