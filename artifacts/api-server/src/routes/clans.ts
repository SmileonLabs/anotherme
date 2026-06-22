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
import { ClanWisdomError, generateClanWisdom, getClanWisdom } from "../lib/clanWisdom";
import {
  CLAN_RANKING_LIMIT_DEFAULT,
  CLAN_RANKING_TYPES,
  getClanRankings,
} from "../lib/clanRanking";
import {
  CLAN_MEMORY_LIST_LIMIT_DEFAULT,
  CLAN_MEMORY_SOURCE_TYPES,
  CLAN_MEMORY_SUMMARY_MAX,
  CLAN_MEMORY_TAGS_MAX,
  CLAN_MEMORY_TAG_MAX,
  CLAN_MEMORY_TITLE_MAX,
  CLAN_MEMORY_TYPES,
  ClanMemoryError,
  createClanMemory,
  deleteClanMemory,
  listClanMemories,
} from "../lib/clanMemory";

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

/** Map a ClanWisdomError to an HTTP status + the Korean message it carries. */
function handleClanWisdomError(res: import("express").Response, err: unknown): boolean {
  if (err instanceof ClanWisdomError) {
    const status =
      err.code === "not_found"
        ? 404
        : err.code === "not_member" || err.code === "forbidden"
          ? 403
          : 400;
    res.status(status).json({ error: err.code, message: err.message });
    return true;
  }
  return false;
}

/** GET /clans/:id/wisdom — read a clan's collective wisdom (members only). */
router.get("/clans/:id/wisdom", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  try {
    const wisdom = await getClanWisdom({ clanId: id, meUserId: req.dbUser!.id });
    res.json(wisdom);
  } catch (err) {
    if (handleClanWisdomError(res, err)) return;
    req.log.error({ err }, "getClanWisdom failed");
    res.status(500).json({ error: "internal", message: "가문의 지혜를 불러오지 못했어요." });
  }
});

/** POST /clans/:id/wisdom/generate — (re)generate wisdom via AI (owner/elder only). */
router.post("/clans/:id/wisdom/generate", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  try {
    const wisdom = await generateClanWisdom({
      clanId: id,
      meUserId: req.dbUser!.id,
      log: req.log,
    });
    res.json(wisdom);
  } catch (err) {
    if (handleClanWisdomError(res, err)) return;
    req.log.error({ err }, "generateClanWisdom failed");
    res.status(500).json({ error: "internal", message: "가문의 지혜를 생성하지 못했어요." });
  }
});

/** Map a ClanMemoryError to an HTTP status + the Korean message it carries. */
function handleClanMemoryError(res: import("express").Response, err: unknown): boolean {
  if (err instanceof ClanMemoryError) {
    const status =
      err.code === "not_found"
        ? 404
        : err.code === "not_member" || err.code === "forbidden"
          ? 403
          : err.code === "duplicate"
            ? 409
            : 400;
    res.status(status).json({ error: err.code, message: err.message });
    return true;
  }
  return false;
}

/** GET /clans/:id/memories — list a clan's memories (members only). */
const memoryListQuerySchema = z.object({
  type: z.enum(CLAN_MEMORY_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

router.get("/clans/:id/memories", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = memoryListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "잘못된 요청이에요." });
    return;
  }
  try {
    const result = await listClanMemories({
      clanId: id,
      meUserId: req.dbUser!.id,
      type: parsed.data.type ?? null,
      limit: parsed.data.limit ?? CLAN_MEMORY_LIST_LIMIT_DEFAULT,
    });
    res.json(result);
  } catch (err) {
    if (handleClanMemoryError(res, err)) return;
    req.log.error({ err }, "listClanMemories failed");
    res.status(500).json({ error: "internal", message: "가문 기억을 불러오지 못했어요." });
  }
});

/** POST /clans/:id/memories — create a memory (members only). */
const memoryCreateBodySchema = z.object({
  memoryType: z.enum(CLAN_MEMORY_TYPES),
  title: z.string().trim().min(1).max(CLAN_MEMORY_TITLE_MAX),
  summary: z.string().trim().min(1).max(CLAN_MEMORY_SUMMARY_MAX),
  tags: z.array(z.string().trim().max(CLAN_MEMORY_TAG_MAX)).max(CLAN_MEMORY_TAGS_MAX).optional(),
  sourceType: z.enum(CLAN_MEMORY_SOURCE_TYPES).optional(),
  sourceId: z.string().trim().max(200).optional(),
  sourceKey: z.string().trim().max(200).optional(),
});

router.post("/clans/:id/memories", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = memoryCreateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "제목과 내용을 확인해 주세요." });
    return;
  }
  try {
    const memory = await createClanMemory({
      clanId: id,
      meUserId: req.dbUser!.id,
      memoryType: parsed.data.memoryType,
      title: parsed.data.title,
      summary: parsed.data.summary,
      tags: parsed.data.tags,
      sourceType: parsed.data.sourceType,
      sourceId: parsed.data.sourceId ?? null,
      sourceKey: parsed.data.sourceKey ?? null,
    });
    res.status(201).json(memory);
  } catch (err) {
    if (handleClanMemoryError(res, err)) return;
    req.log.error({ err }, "createClanMemory failed");
    res.status(500).json({ error: "internal", message: "가문 기억 저장에 실패했어요." });
  }
});

/** DELETE /clans/:id/memories/:memoryId — delete a memory (author or elder/owner). */
router.delete("/clans/:id/memories/:memoryId", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const memoryId = Array.isArray(req.params.memoryId)
    ? req.params.memoryId[0]
    : req.params.memoryId;
  try {
    const result = await deleteClanMemory({
      clanId: id,
      memoryId,
      meUserId: req.dbUser!.id,
    });
    res.json(result);
  } catch (err) {
    if (handleClanMemoryError(res, err)) return;
    req.log.error({ err }, "deleteClanMemory failed");
    res.status(500).json({ error: "internal", message: "가문 기억 삭제에 실패했어요." });
  }
});

export default router;
