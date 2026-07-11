import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  friendshipsTable,
  starFeedCommentsTable,
  starFeedPostsTable,
  starFeedReactionsTable,
  usersTable,
  type StarFeedPostKind,
} from "@workspace/db";

export const STAR_FEED_POST_TITLE_MAX = 80;
export const STAR_FEED_POST_BODY_MAX = 500;
export const STAR_FEED_COMMENT_BODY_MAX = 240;
export const STAR_FEED_LIST_LIMIT_DEFAULT = 30;

export interface StarFeedAuthorView {
  id: string | null;
  nickname: string;
  profileImageUrl: string | null;
}

export interface StarFeedCommentView {
  id: string;
  body: string;
  createdAt: string;
  author: StarFeedAuthorView;
}

export interface StarFeedPostView {
  id: string;
  kind: StarFeedPostKind;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  visibility: string;
  createdAt: string;
  author: StarFeedAuthorView;
  reactionCount: number;
  commentCount: number;
  reactedByMe: boolean;
  recentComments: StarFeedCommentView[];
}

export interface CreateStarFeedPostResult {
  post: StarFeedPostView;
  created: boolean;
}

type PostRow = {
  id: string;
  kind: StarFeedPostKind;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  visibility: string;
  createdAt: Date;
  authorUserId: string | null;
  authorNickname: string | null;
  authorProfileImageUrl: string | null;
};

function serializeAuthor(row: {
  authorUserId: string | null;
  authorNickname: string | null;
  authorProfileImageUrl: string | null;
}): StarFeedAuthorView {
  return {
    id: row.authorUserId,
    nickname: row.authorNickname ?? "STAR 공식",
    profileImageUrl: row.authorProfileImageUrl,
  };
}

async function decoratePosts(meUserId: string, rows: PostRow[]): Promise<StarFeedPostView[]> {
  if (rows.length === 0) return [];

  const postIds = rows.map((row) => row.id);
  const [reactionCounts, commentCounts, myReactions, comments] = await Promise.all([
    db
      .select({ postId: starFeedReactionsTable.postId, count: sql<number>`count(*)::int` })
      .from(starFeedReactionsTable)
      .where(inArray(starFeedReactionsTable.postId, postIds))
      .groupBy(starFeedReactionsTable.postId),
    db
      .select({ postId: starFeedCommentsTable.postId, count: sql<number>`count(*)::int` })
      .from(starFeedCommentsTable)
      .where(inArray(starFeedCommentsTable.postId, postIds))
      .groupBy(starFeedCommentsTable.postId),
    db
      .select({ postId: starFeedReactionsTable.postId })
      .from(starFeedReactionsTable)
      .where(and(inArray(starFeedReactionsTable.postId, postIds), eq(starFeedReactionsTable.userId, meUserId))),
    db
      .select({
        id: starFeedCommentsTable.id,
        postId: starFeedCommentsTable.postId,
        body: starFeedCommentsTable.body,
        createdAt: starFeedCommentsTable.createdAt,
        authorUserId: usersTable.id,
        authorNickname: usersTable.nickname,
        authorProfileImageUrl: usersTable.profileImageUrl,
      })
      .from(starFeedCommentsTable)
      .leftJoin(usersTable, eq(usersTable.id, starFeedCommentsTable.userId))
      .where(inArray(starFeedCommentsTable.postId, postIds))
      .orderBy(desc(starFeedCommentsTable.createdAt))
      .limit(postIds.length * 2),
  ]);

  const reactionCountByPost = new Map(reactionCounts.map((row) => [row.postId, row.count]));
  const commentCountByPost = new Map(commentCounts.map((row) => [row.postId, row.count]));
  const reactedPostIds = new Set(myReactions.map((row) => row.postId));
  const recentCommentsByPost = new Map<string, StarFeedCommentView[]>();

  for (const comment of comments) {
    const list = recentCommentsByPost.get(comment.postId) ?? [];
    if (list.length >= 2) continue;
    list.push({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      author: serializeAuthor(comment),
    });
    recentCommentsByPost.set(comment.postId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    metadata: serializeMetadataForViewer(row, meUserId),
    visibility: row.visibility,
    createdAt: row.createdAt.toISOString(),
    author: serializeAuthor(row),
    reactionCount: reactionCountByPost.get(row.id) ?? 0,
    commentCount: commentCountByPost.get(row.id) ?? 0,
    reactedByMe: reactedPostIds.has(row.id),
    recentComments: (recentCommentsByPost.get(row.id) ?? []).reverse(),
  }));
}

function serializeMetadataForViewer(row: PostRow, meUserId: string): Record<string, unknown> | null {
  const metadata = row.metadata ? { ...row.metadata } : null;
  if (!metadata) return null;
  if (row.kind === "talk_diary" && row.authorUserId !== meUserId) {
    delete metadata.pvtAmount;
    delete metadata.qualityScore;
  }
  return metadata;
}

async function canViewPostRow(meUserId: string, row: PostRow | undefined): Promise<boolean> {
  if (!row) return false;
  if (row.visibility === "PUBLIC") return true;
  if (row.authorUserId === meUserId) return true;
  if (row.visibility !== "FRIENDS" || !row.authorUserId) return false;
  const [friendship] = await db
    .select({ id: friendshipsTable.id })
    .from(friendshipsTable)
    .where(sql`
      (${friendshipsTable.userAId} = ${meUserId} AND ${friendshipsTable.userBId} = ${row.authorUserId})
      OR (${friendshipsTable.userBId} = ${meUserId} AND ${friendshipsTable.userAId} = ${row.authorUserId})
    `)
    .limit(1);
  return !!friendship;
}

async function selectPostRows(where?: ReturnType<typeof eq>): Promise<PostRow[]> {
  const query = db
    .select({
      id: starFeedPostsTable.id,
      kind: starFeedPostsTable.kind,
      title: starFeedPostsTable.title,
      body: starFeedPostsTable.body,
      metadata: starFeedPostsTable.metadata,
      visibility: starFeedPostsTable.visibility,
      createdAt: starFeedPostsTable.createdAt,
      authorUserId: usersTable.id,
      authorNickname: usersTable.nickname,
      authorProfileImageUrl: usersTable.profileImageUrl,
    })
    .from(starFeedPostsTable)
    .leftJoin(usersTable, eq(usersTable.id, starFeedPostsTable.authorUserId));

  return where
    ? query.where(where).orderBy(desc(starFeedPostsTable.createdAt)).limit(1)
    : query.orderBy(desc(starFeedPostsTable.createdAt)).limit(STAR_FEED_LIST_LIMIT_DEFAULT);
}

export async function listStarFeedPosts(
  meUserId: string,
  limit = STAR_FEED_LIST_LIMIT_DEFAULT,
): Promise<StarFeedPostView[]> {
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  const rows = await db
    .select({
      id: starFeedPostsTable.id,
      kind: starFeedPostsTable.kind,
      title: starFeedPostsTable.title,
      body: starFeedPostsTable.body,
      metadata: starFeedPostsTable.metadata,
      visibility: starFeedPostsTable.visibility,
      createdAt: starFeedPostsTable.createdAt,
      authorUserId: usersTable.id,
      authorNickname: usersTable.nickname,
      authorProfileImageUrl: usersTable.profileImageUrl,
    })
    .from(starFeedPostsTable)
    .leftJoin(usersTable, eq(usersTable.id, starFeedPostsTable.authorUserId))
    .where(sql`
      ${starFeedPostsTable.visibility} = 'PUBLIC'
      OR ${starFeedPostsTable.authorUserId} = ${meUserId}
      OR (
        ${starFeedPostsTable.visibility} = 'FRIENDS'
        AND EXISTS (
          SELECT 1 FROM friendships f
          WHERE (f.user_a_id = ${meUserId} AND f.user_b_id = ${starFeedPostsTable.authorUserId})
             OR (f.user_b_id = ${meUserId} AND f.user_a_id = ${starFeedPostsTable.authorUserId})
        )
      )
    `)
    .orderBy(desc(starFeedPostsTable.createdAt))
    .limit(safeLimit);

  return decoratePosts(meUserId, rows);
}

export async function getStarFeedPost(
  meUserId: string,
  postId: string,
): Promise<StarFeedPostView | null> {
  const rows = await selectPostRows(eq(starFeedPostsTable.id, postId));
  if (!(await canViewPostRow(meUserId, rows[0]))) return null;
  const [post] = await decoratePosts(meUserId, rows);
  return post ?? null;
}

export async function getStarFeedPostBySourceKey(
  meUserId: string,
  sourceKey: string,
): Promise<StarFeedPostView | null> {
  const rows = await selectPostRows(eq(starFeedPostsTable.sourceKey, sourceKey));
  if (!(await canViewPostRow(meUserId, rows[0]))) return null;
  const [post] = await decoratePosts(meUserId, rows);
  return post ?? null;
}

export async function createStarFeedPostWithResult(params: {
  userId: string;
  kind: Extract<StarFeedPostKind, "fan" | "star">;
  title?: string | null;
  body: string;
  sourceKey?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<CreateStarFeedPostResult> {
  const title = params.title?.trim() || (params.kind === "star" ? "공식 STAR 기록" : "팬 응원");
  const values = {
    authorUserId: params.userId,
    kind: params.kind,
    sourceKey: params.sourceKey ?? null,
    title,
    body: params.body,
    metadata: params.metadata ?? null,
  };

  const [created] = params.sourceKey
    ? await db
        .insert(starFeedPostsTable)
        .values(values)
        .onConflictDoNothing({ target: starFeedPostsTable.sourceKey })
        .returning({ id: starFeedPostsTable.id })
    : await db.insert(starFeedPostsTable).values(values).returning({ id: starFeedPostsTable.id });

  if (!created && params.sourceKey) {
    const existing = await getStarFeedPostBySourceKey(params.userId, params.sourceKey);
    if (!existing) throw new Error("star feed post duplicate reload failed");
    return { post: existing, created: false };
  }

  if (!created) throw new Error("star feed post create failed");
  const post = await getStarFeedPost(params.userId, created.id);
  if (!post) throw new Error("star feed post reload failed");
  return { post, created: true };
}

export async function createStarFeedPost(params: {
  userId: string;
  kind: Extract<StarFeedPostKind, "fan" | "star">;
  title?: string | null;
  body: string;
  sourceKey?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<StarFeedPostView> {
  const result = await createStarFeedPostWithResult(params);
  return result.post;
}

export async function cheerStarFeedPost(meUserId: string, postId: string): Promise<StarFeedPostView | null> {
  const post = await getStarFeedPost(meUserId, postId);
  if (!post) return null;

  await db
    .insert(starFeedReactionsTable)
    .values({ postId, userId: meUserId, reactionType: "cheer" })
    .onConflictDoNothing({ target: [starFeedReactionsTable.postId, starFeedReactionsTable.userId] });

  return getStarFeedPost(meUserId, postId);
}

export async function commentStarFeedPost(params: {
  userId: string;
  postId: string;
  body: string;
}): Promise<StarFeedPostView | null> {
  const post = await getStarFeedPost(params.userId, params.postId);
  if (!post) return null;

  await db.insert(starFeedCommentsTable).values({
    postId: params.postId,
    userId: params.userId,
    body: params.body,
  });

  return getStarFeedPost(params.userId, params.postId);
}
