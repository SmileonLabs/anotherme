import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db, starProfilesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { ensurePlayModeState } from "../lib/fanStar";
import { recordReward } from "../lib/growth";
import { resolveCharacterProfileActor, setCharacterProfileFollowing } from "../lib/characterProfiles";
import {
  STAR_FEED_COMMENT_BODY_MAX,
  STAR_FEED_LIST_LIMIT_DEFAULT,
  STAR_FEED_POST_BODY_MAX,
  STAR_FEED_POST_TITLE_MAX,
  cheerStarFeedPost,
  commentStarFeedPost,
  createStarFeedPost,
  createStarPostActivities,
  listStarFeedPosts,
  listStarFeedActivities,
  markStarFeedActivitiesRead,
  reportStarFeedPost,
  repostStarFeedPost,
  listStarResultDrafts,
  approveStarResultDraft,
  discardStarResultDraft,
  discoverStarFeedByHashtag,
} from "../lib/starFeed";

const router: IRouter = Router();

function requestProfileId(req: { header(name: string): string | undefined }): string | undefined {
  return req.header("x-character-profile-id");
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  scope: z.enum(["recommended", "following"]).optional(),
});

const createPostBodySchema = z.object({
  kind: z.enum(["fan", "star"]).optional(),
  targetStarProfileId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(STAR_FEED_POST_TITLE_MAX).optional(),
  body: z.string().trim().min(1).max(STAR_FEED_POST_BODY_MAX),
  media: z.array(z.object({
    objectPath: z.string().startsWith("/objects/").max(1024),
    mediaType: z.enum(["image", "video"]),
    altText: z.string().trim().max(160).optional(),
  })).max(4).optional(),
});

const reportPostBodySchema = z.object({
  reason: z.enum(["spam", "harassment", "sexual", "violence", "copyright", "other"]),
  details: z.string().trim().max(500).optional(),
});

const createCommentBodySchema = z.object({
  body: z.string().trim().min(1).max(STAR_FEED_COMMENT_BODY_MAX),
});

router.get("/star-feed/posts", requireAuth, async (req, res): Promise<void> => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "잘못된 요청이에요." });
    return;
  }

  res.json(
    await listStarFeedPosts(req.dbUser!.id, parsed.data.limit ?? STAR_FEED_LIST_LIMIT_DEFAULT, parsed.data.scope ?? "recommended"),
  );
});

router.get("/star-feed/discover", requireAuth, async (req, res): Promise<void> => {
  const tag = typeof req.query.tag === "string" ? req.query.tag : "";
  const limit = z.coerce.number().int().min(1).max(100).catch(30).parse(req.query.limit);
  if (!tag) { res.status(400).json({ error: "invalid", message: "A hashtag is required" }); return; }
  res.json(await discoverStarFeedByHashtag(req.dbUser!.id, tag, limit));
});

router.get("/star-feed/activities", requireAuth, async (req, res): Promise<void> => {
  const limit = z.coerce.number().int().min(1).max(100).optional().safeParse(req.query.limit);
  if (!limit.success) {
    res.status(400).json({ error: "invalid", message: "Invalid limit" });
    return;
  }
  res.json(await listStarFeedActivities(req.dbUser!.id, limit.data ?? 30));
});

router.post("/star-feed/activities/read", requireAuth, async (req, res): Promise<void> => {
  await markStarFeedActivitiesRead(req.dbUser!.id);
  res.status(204).end();
});

router.get("/star-feed/result-drafts", requireAuth, async (req, res): Promise<void> => {
  res.json(await listStarResultDrafts(req.dbUser!.id));
});

router.post("/star-feed/result-drafts/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const post = z.string().uuid().safeParse(id).success ? await approveStarResultDraft(req.dbUser!.id, id) : null;
  if (!post) { res.status(404).json({ error: "not_found", message: "Result draft not found" }); return; }
  res.json(post);
});

router.post("/star-feed/result-drafts/:id/discard", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!z.string().uuid().safeParse(id).success || !(await discardStarResultDraft(req.dbUser!.id, id))) { res.status(404).json({ error: "not_found", message: "Result draft not found" }); return; }
  res.status(204).end();
});

router.post("/star-feed/posts", requireAuth, async (req, res): Promise<void> => {
  const parsed = createPostBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "작성 내용을 확인해 주세요." });
    return;
  }

  const kind = parsed.data.kind ?? "fan";
  const actorProfile = await resolveCharacterProfileActor(req.dbUser!.id, requestProfileId(req));
  if ((kind === "fan" && actorProfile.type !== "fan") || (kind === "star" && actorProfile.type !== "star")) {
    res.status(409).json({ error: "PROFILE_TYPE_MISMATCH" });
    return;
  }
  const playState = kind === "star" ? await ensurePlayModeState(req.dbUser!.id) : null;
  if (kind === "fan" && parsed.data.targetStarProfileId) {
    const [targetStar] = await db
      .select({ id: starProfilesTable.id })
      .from(starProfilesTable)
      .where(eq(starProfilesTable.id, parsed.data.targetStarProfileId))
      .limit(1);
    if (!targetStar) {
      res.status(404).json({ error: "STAR_NOT_FOUND", message: "응원 대상 STAR를 찾을 수 없습니다." });
      return;
    }
  }
  if (kind === "star") {
    const state = playState!;
    if (!state.starUnlocked) {
      res.status(403).json({
        error: "STAR_LOCKED",
        message: "STAR NFT 보유자만 STAR 기록을 남길 수 있어요.",
        state,
      });
      return;
    }
    if (!state.equippedStar) {
      res.status(409).json({
        error: "STAR_NOT_EQUIPPED",
        message: "STAR 기록을 남기려면 먼저 NFT를 장착해 주세요.",
        state,
      });
      return;
    }
    if (state.equippedStar.stage !== "promoted") {
      res.status(403).json({
        error: "TORIMIA_REQUIRED",
        message: "토르미아의 문을 연 공식 STAR만 공식 STAR 기록을 남길 수 있어요.",
        state,
      });
      return;
    }
  }

  const post = await createStarFeedPost({
    userId: req.dbUser!.id,
    kind,
    title: parsed.data.title,
    body: parsed.data.body,
    media: parsed.data.media,
    authorStarProfileId: playState?.equippedStar?.id ?? null,
    authorProfileId: actorProfile.id,
    targetStarProfileId: kind === "fan" ? parsed.data.targetStarProfileId ?? null : null,
  });
  if (kind === "star") await createStarPostActivities(post);
  if (kind === "fan") {
    void recordReward({
      userId: req.dbUser!.id,
      sourceType: "system",
      eventType: "fan_support" as never,
      sourceKey: `fan_support:${post.id}`,
      expDelta: parsed.data.targetStarProfileId ? 5 : 2,
      reason: parsed.data.targetStarProfileId ? "STAR 응원 활동" : "FAN 커뮤니티 활동",
      metadata: { targetStarProfileId: parsed.data.targetStarProfileId ?? null, postId: post.id },
    }).catch(() => undefined);
  }
  res.status(201).json(post);
});

router.post("/star-feed/posts/:id/reports", requireAuth, async (req, res): Promise<void> => {
  const parsed = reportPostBodySchema.safeParse(req.body);
  const postId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!parsed.success || !z.string().uuid().safeParse(postId).success) {
    res.status(400).json({ error: "invalid", message: "Invalid report" });
    return;
  }
  if (!(await reportStarFeedPost({ userId: req.dbUser!.id, postId, ...parsed.data }))) {
    res.status(404).json({ error: "not_found", message: "Post not found" });
    return;
  }
  res.status(201).json({ reported: true });
});

router.post("/star-feed/posts/:id/repost", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const post = z.string().uuid().safeParse(id).success ? await repostStarFeedPost(req.dbUser!.id, id) : null;
  if (!post) { res.status(404).json({ error: "not_found", message: "Post not found" }); return; }
  res.status(201).json(post);
});

router.post("/star-feed/star-profiles/:id/follow", requireAuth, async (req, res): Promise<void> => {
  const profileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!z.string().uuid().safeParse(profileId).success) {
    res.status(400).json({ error: "invalid", message: "Invalid STAR profile id" });
    return;
  }
  try {
    res.json(await setCharacterProfileFollowing(req.dbUser!.id, profileId, true));
  } catch (error) {
    const code = error instanceof Error ? error.message : "unknown";
    const status = code === "star_profile_not_found" ? 404 : code === "cannot_follow_own_star_profile" ? 409 : 500;
    res.status(status).json({ error: code, message: code });
  }
});

router.delete("/star-feed/star-profiles/:id/follow", requireAuth, async (req, res): Promise<void> => {
  const profileId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!z.string().uuid().safeParse(profileId).success) {
    res.status(400).json({ error: "invalid", message: "Invalid STAR profile id" });
    return;
  }
  const result = await setCharacterProfileFollowing(req.dbUser!.id, profileId, false);
  if (!result) { res.status(404).json({ error: "PROFILE_NOT_FOUND" }); return; }
  res.json(result);
});

router.post("/star-feed/posts/:id/reactions", requireAuth, async (req, res): Promise<void> => {
  const postId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const actor = await resolveCharacterProfileActor(req.dbUser!.id, requestProfileId(req));
  const post = await cheerStarFeedPost(req.dbUser!.id, postId, actor.id);
  if (!post) {
    res.status(404).json({ error: "not_found", message: "피드 글을 찾을 수 없어요." });
    return;
  }
  res.json(post);
});

router.post("/star-feed/posts/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const parsed = createCommentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "댓글 내용을 확인해 주세요." });
    return;
  }

  const postId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const post = await commentStarFeedPost({
    userId: req.dbUser!.id,
    actorProfileId: (await resolveCharacterProfileActor(req.dbUser!.id, requestProfileId(req))).id,
    postId,
    body: parsed.data.body,
  });
  if (!post) {
    res.status(404).json({ error: "not_found", message: "피드 글을 찾을 수 없어요." });
    return;
  }
  res.status(201).json(post);
});

export default router;
