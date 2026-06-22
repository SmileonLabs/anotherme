import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../lib/auth";
import {
  CLAN_ARCHETYPE_KEYS,
  CLAN_DESCRIPTION_MAX,
  CLAN_LIST_LIMIT_DEFAULT,
  CLAN_NAME_MAX,
  CLAN_NAME_MIN,
  CLAN_VALUES_MAX,
  ClanError,
  createClan,
  getClanDetail,
  getMyClan,
  joinClan,
  leaveClan,
  listClans,
  type ClanArchetypeKey,
} from "../lib/clan";
import { getClanIdentity } from "../lib/clanGrowth";
import {
  CLAN_RANKING_LIMIT_DEFAULT,
  CLAN_RANKING_TYPES,
  getClanRankings,
} from "../lib/clanRanking";

const router: IRouter = Router();

/** Map a ClanError to an HTTP status + the (Korean) message it carries. */
function handleClanError(res: import("express").Response, err: unknown): boolean {
  if (err instanceof ClanError) {
    const status =
      err.code === "not_found"
        ? 404
        : err.code === "already_in_clan" || err.code === "name_taken"
          ? 409
          : err.code === "owner_must_transfer"
            ? 403
            : err.code === "not_member"
              ? 403
              : 400;
    res.status(status).json({ error: err.code, message: err.message });
    return true;
  }
  return false;
}

/** GET /users/me/clan — my clan (or null). */
router.get("/users/me/clan", requireAuth, async (req, res): Promise<void> => {
  const mine = await getMyClan(req.dbUser!.id);
  res.json(mine);
});

/** GET /clans — browse/search clans. */
const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  archetype: z.enum(CLAN_ARCHETYPE_KEYS).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

router.get("/clans", requireAuth, async (req, res): Promise<void> => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "잘못된 요청이에요." });
    return;
  }
  const { q, archetype, limit } = parsed.data;
  const result = await listClans({
    q: q ?? null,
    archetype: (archetype as ClanArchetypeKey | undefined) ?? null,
    limit: limit ?? CLAN_LIST_LIMIT_DEFAULT,
  });
  res.json(result);
});

/** GET /clans/rankings — clan leaderboards (read-only). Registered before
 * `/clans/:id` so "rankings" is not captured as an :id path param. */
const rankingQuerySchema = z.object({
  type: z.enum(CLAN_RANKING_TYPES).optional(),
  archetype: z.enum(CLAN_ARCHETYPE_KEYS).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

router.get("/clans/rankings", requireAuth, async (req, res): Promise<void> => {
  const parsed = rankingQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "잘못된 요청이에요." });
    return;
  }
  const { type, archetype, limit } = parsed.data;
  const result = await getClanRankings({
    type: type ?? "overall",
    archetype: (archetype as ClanArchetypeKey | undefined) ?? null,
    limit: limit ?? CLAN_RANKING_LIMIT_DEFAULT,
    meUserId: req.dbUser!.id,
  });
  res.json(result);
});

/** GET /clans/:id — clan detail with members. */
router.get("/clans/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const detail = await getClanDetail(id);
  if (!detail) {
    res.status(404).json({ error: "not_found", message: "존재하지 않는 가문이에요." });
    return;
  }
  res.json(detail);
});

/** POST /clans — create a clan. */
const createBodySchema = z.object({
  name: z.string().trim().min(CLAN_NAME_MIN).max(CLAN_NAME_MAX),
  description: z.string().trim().max(CLAN_DESCRIPTION_MAX).optional(),
  clanValues: z.string().trim().max(CLAN_VALUES_MAX).optional(),
  preferredArchetype: z.enum(CLAN_ARCHETYPE_KEYS).optional(),
  emblemUrl: z.string().trim().max(1000).optional(),
});

router.post("/clans", requireAuth, async (req, res): Promise<void> => {
  const parsed = createBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "가문 이름은 2~20자로 입력해 주세요." });
    return;
  }
  try {
    const mine = await createClan({
      userId: req.dbUser!.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      clanValues: parsed.data.clanValues ?? null,
      preferredArchetype: (parsed.data.preferredArchetype as ClanArchetypeKey | undefined) ?? null,
      emblemUrl: parsed.data.emblemUrl ?? null,
    });
    res.status(201).json(mine);
  } catch (err) {
    if (handleClanError(res, err)) return;
    req.log.error({ err }, "createClan failed");
    res.status(500).json({ error: "internal", message: "가문 생성에 실패했어요." });
  }
});

/** GET /clans/:id/identity — the clan's computed collective identity. */
router.get("/clans/:id/identity", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const identity = await getClanIdentity(id);
  if (!identity) {
    res.status(404).json({ error: "not_found", message: "존재하지 않는 가문이에요." });
    return;
  }
  res.json(identity);
});

/** POST /clans/:id/join — join a clan. */
router.post("/clans/:id/join", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  try {
    const mine = await joinClan({ userId: req.dbUser!.id, clanId: id });
    res.json(mine);
  } catch (err) {
    if (handleClanError(res, err)) return;
    req.log.error({ err }, "joinClan failed");
    res.status(500).json({ error: "internal", message: "가문 가입에 실패했어요." });
  }
});

/** POST /clans/:id/leave — leave a clan (or delete it if owner is last member). */
router.post("/clans/:id/leave", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  try {
    const result = await leaveClan({ userId: req.dbUser!.id, clanId: id });
    res.json(result);
  } catch (err) {
    if (handleClanError(res, err)) return;
    req.log.error({ err }, "leaveClan failed");
    res.status(500).json({ error: "internal", message: "가문 탈퇴에 실패했어요." });
  }
});

export default router;
