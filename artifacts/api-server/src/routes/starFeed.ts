import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../lib/auth";
import { ensurePlayModeState } from "../lib/fanStar";
import {
  STAR_FEED_COMMENT_BODY_MAX,
  STAR_FEED_LIST_LIMIT_DEFAULT,
  STAR_FEED_POST_BODY_MAX,
  STAR_FEED_POST_TITLE_MAX,
  cheerStarFeedPost,
  commentStarFeedPost,
  createStarFeedPost,
  listStarFeedPosts,
} from "../lib/starFeed";

const router: IRouter = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const createPostBodySchema = z.object({
  kind: z.enum(["fan", "star"]).optional(),
  title: z.string().trim().max(STAR_FEED_POST_TITLE_MAX).optional(),
  body: z.string().trim().min(1).max(STAR_FEED_POST_BODY_MAX),
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
    await listStarFeedPosts(req.dbUser!.id, parsed.data.limit ?? STAR_FEED_LIST_LIMIT_DEFAULT),
  );
});

router.post("/star-feed/posts", requireAuth, async (req, res): Promise<void> => {
  const parsed = createPostBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "작성 내용을 확인해 주세요." });
    return;
  }

  const kind = parsed.data.kind ?? "fan";
  if (kind === "star") {
    const state = await ensurePlayModeState(req.dbUser!.id);
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
  });
  res.status(201).json(post);
});

router.post("/star-feed/posts/:id/reactions", requireAuth, async (req, res): Promise<void> => {
  const postId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const post = await cheerStarFeedPost(req.dbUser!.id, postId);
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
