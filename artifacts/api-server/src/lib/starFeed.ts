import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  db,
  friendshipsTable,
  starFeedCommentsTable,
  starFeedActivitiesTable,
  starFeedReportsTable,
  starResultDraftsTable,
  starFeedPostsTable,
  starFeedReactionsTable,
  starProfileFollowsTable,
  starProfilesTable,
  usersTable,
  type StarFeedPostKind,
} from "@workspace/db";

export const STAR_FEED_POST_TITLE_MAX = 80;
export const STAR_FEED_POST_BODY_MAX = 500;
export const STAR_FEED_COMMENT_BODY_MAX = 240;
export const STAR_FEED_LIST_LIMIT_DEFAULT = 30;

export function normalizeHashtags(value: string): string[] {
  return [...new Set([...value.matchAll(/(?:^|\s)#([\p{L}\p{N}_]{1,40})/gu)].map((match) => match[1].toLowerCase()))].slice(0, 10);
}

export async function discoverStarFeedByHashtag(userId: string, tag: string, limit = 30): Promise<StarFeedPostView[]> {
  const normalized = tag.replace(/^#/, "").trim().toLowerCase();
  if (!/^[\p{L}\p{N}_]{1,40}$/u.test(normalized)) return [];
  const ids = await db.select({ id: starFeedPostsTable.id }).from(starFeedPostsTable)
    .where(sql`${starFeedPostsTable.status} = 'PUBLISHED' AND ${starFeedPostsTable.visibility} = 'PUBLIC' AND ${starFeedPostsTable.hashtags} @> ${JSON.stringify([normalized])}::jsonb`)
    .orderBy(desc(starFeedPostsTable.createdAt)).limit(Math.min(100, Math.max(1, limit)));
  const posts = await Promise.all(ids.map((row) => getStarFeedPost(userId, row.id)));
  return posts.filter((post): post is StarFeedPostView => post !== null);
}

export interface StarFeedAuthorView {
  id: string | null;
  nickname: string;
  profileImageUrl: string | null;
  starProfile: { id: string; displayName: string; imageUrl: string | null; stage: string; followedByMe: boolean } | null;
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
  media: Array<{ objectPath: string; mediaType: "image" | "video"; altText?: string }>;
  status: string;
  visibility: string;
  createdAt: string;
  author: StarFeedAuthorView;
  targetStarProfile: { id: string; displayName: string; imageUrl: string | null } | null;
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
  media: Array<{ objectPath: string; mediaType: "image" | "video"; altText?: string }> | null;
  status: string;
  visibility: string;
  createdAt: Date;
  authorUserId: string | null;
  authorNickname: string | null;
  authorProfileImageUrl: string | null;
  authorStarProfileId: string | null;
  authorStarDisplayName: string | null;
  authorStarImageUrl: string | null;
  authorStarStage: string | null;
  targetStarProfileId: string | null;
  targetStarDisplayName: string | null;
  targetStarImageUrl: string | null;
};

const targetStarProfilesTable = alias(starProfilesTable, "target_star_profiles");

function serializeAuthor(row: Pick<PostRow, "authorUserId" | "authorNickname" | "authorProfileImageUrl" | "authorStarProfileId" | "authorStarDisplayName" | "authorStarImageUrl" | "authorStarStage">, followedStarProfileIds = new Set<string>()): StarFeedAuthorView {
  return {
    id: row.authorUserId,
    nickname: row.authorNickname ?? "STAR 공식",
    profileImageUrl: row.authorProfileImageUrl,
    starProfile: row.authorStarProfileId && row.authorStarDisplayName && row.authorStarStage
      ? { id: row.authorStarProfileId, displayName: row.authorStarDisplayName, imageUrl: row.authorStarImageUrl, stage: row.authorStarStage, followedByMe: followedStarProfileIds.has(row.authorStarProfileId) }
      : null,
  };
}

async function decoratePosts(meUserId: string, rows: PostRow[]): Promise<StarFeedPostView[]> {
  if (rows.length === 0) return [];

  const postIds = rows.map((row) => row.id);
  const starProfileIds = rows.flatMap((row) => row.authorStarProfileId ? [row.authorStarProfileId] : []);
  const [reactionCounts, commentCounts, myReactions, comments, followedProfiles] = await Promise.all([
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
    starProfileIds.length
      ? db.select({ starProfileId: starProfileFollowsTable.starProfileId }).from(starProfileFollowsTable).where(and(eq(starProfileFollowsTable.followerUserId, meUserId), inArray(starProfileFollowsTable.starProfileId, starProfileIds)))
      : Promise.resolve([]),
  ]);

  const reactionCountByPost = new Map(reactionCounts.map((row) => [row.postId, row.count]));
  const commentCountByPost = new Map(commentCounts.map((row) => [row.postId, row.count]));
  const reactedPostIds = new Set(myReactions.map((row) => row.postId));
  const followedStarProfileIds = new Set(followedProfiles.map((row) => row.starProfileId));
  const recentCommentsByPost = new Map<string, StarFeedCommentView[]>();

  for (const comment of comments) {
    const list = recentCommentsByPost.get(comment.postId) ?? [];
    if (list.length >= 2) continue;
    list.push({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      author: serializeAuthor({ ...comment, authorStarProfileId: null, authorStarDisplayName: null, authorStarImageUrl: null, authorStarStage: null }),
    });
    recentCommentsByPost.set(comment.postId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    metadata: serializeMetadataForViewer(row, meUserId),
    media: row.media ?? [],
    status: row.status,
    visibility: row.visibility,
    createdAt: row.createdAt.toISOString(),
    author: serializeAuthor(row, followedStarProfileIds),
    targetStarProfile: row.targetStarProfileId && row.targetStarDisplayName
      ? { id: row.targetStarProfileId, displayName: row.targetStarDisplayName, imageUrl: row.targetStarImageUrl }
      : null,
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
      media: starFeedPostsTable.media,
      status: starFeedPostsTable.status,
      visibility: starFeedPostsTable.visibility,
      createdAt: starFeedPostsTable.createdAt,
      authorUserId: usersTable.id,
      authorNickname: usersTable.nickname,
      authorProfileImageUrl: usersTable.profileImageUrl,
      authorStarProfileId: starFeedPostsTable.authorStarProfileId,
      authorStarDisplayName: starProfilesTable.displayName,
      authorStarImageUrl: starProfilesTable.imageUrl,
      authorStarStage: starProfilesTable.stage,
      targetStarProfileId: starFeedPostsTable.targetStarProfileId,
      targetStarDisplayName: targetStarProfilesTable.displayName,
      targetStarImageUrl: targetStarProfilesTable.imageUrl,
    })
    .from(starFeedPostsTable)
    .leftJoin(usersTable, eq(usersTable.id, starFeedPostsTable.authorUserId))
    .leftJoin(starProfilesTable, eq(starProfilesTable.id, starFeedPostsTable.authorStarProfileId))
    .leftJoin(targetStarProfilesTable, eq(targetStarProfilesTable.id, starFeedPostsTable.targetStarProfileId));

  return where
    ? query.where(where).orderBy(desc(starFeedPostsTable.createdAt)).limit(1)
    : query.orderBy(desc(starFeedPostsTable.createdAt)).limit(STAR_FEED_LIST_LIMIT_DEFAULT);
}

export async function listStarFeedPosts(
  meUserId: string,
  limit = STAR_FEED_LIST_LIMIT_DEFAULT,
  scope: "recommended" | "following" = "recommended",
): Promise<StarFeedPostView[]> {
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  const rows = await db
    .select({
      id: starFeedPostsTable.id,
      kind: starFeedPostsTable.kind,
      title: starFeedPostsTable.title,
      body: starFeedPostsTable.body,
      metadata: starFeedPostsTable.metadata,
      media: starFeedPostsTable.media,
      status: starFeedPostsTable.status,
      visibility: starFeedPostsTable.visibility,
      createdAt: starFeedPostsTable.createdAt,
      authorUserId: usersTable.id,
      authorNickname: usersTable.nickname,
      authorProfileImageUrl: usersTable.profileImageUrl,
      authorStarProfileId: starFeedPostsTable.authorStarProfileId,
      authorStarDisplayName: starProfilesTable.displayName,
      authorStarImageUrl: starProfilesTable.imageUrl,
      authorStarStage: starProfilesTable.stage,
      targetStarProfileId: starFeedPostsTable.targetStarProfileId,
      targetStarDisplayName: targetStarProfilesTable.displayName,
      targetStarImageUrl: targetStarProfilesTable.imageUrl,
    })
    .from(starFeedPostsTable)
    .leftJoin(usersTable, eq(usersTable.id, starFeedPostsTable.authorUserId))
    .leftJoin(starProfilesTable, eq(starProfilesTable.id, starFeedPostsTable.authorStarProfileId))
    .leftJoin(targetStarProfilesTable, eq(targetStarProfilesTable.id, starFeedPostsTable.targetStarProfileId))
    .where(sql`${scope === "following" ? sql`
      (${starFeedPostsTable.authorUserId} = ${meUserId}
       OR EXISTS (SELECT 1 FROM star_profile_follows sf WHERE sf.follower_user_id = ${meUserId} AND sf.star_profile_id = ${starFeedPostsTable.authorStarProfileId}))
      AND ${starFeedPostsTable.visibility} = 'PUBLIC' AND ${starFeedPostsTable.status} = 'PUBLISHED'
    ` : sql`
      (${starFeedPostsTable.visibility} = 'PUBLIC' AND ${starFeedPostsTable.status} = 'PUBLISHED')
      OR ${starFeedPostsTable.authorUserId} = ${meUserId}
      OR (
        ${starFeedPostsTable.visibility} = 'FRIENDS'
        AND EXISTS (
          SELECT 1 FROM friendships f
          WHERE (f.user_a_id = ${meUserId} AND f.user_b_id = ${starFeedPostsTable.authorUserId})
             OR (f.user_b_id = ${meUserId} AND f.user_a_id = ${starFeedPostsTable.authorUserId})
        )
      )
    `}`)
    .orderBy(desc(starFeedPostsTable.createdAt))
    .limit(safeLimit);

  return decoratePosts(meUserId, rows);
}

export async function listPublicStarFeedPostsByAuthor(
  viewerUserId: string,
  authorUserId: string,
  limit = STAR_FEED_LIST_LIMIT_DEFAULT,
  starProfileId?: string,
  cursor?: string,
): Promise<{ items: StarFeedPostView[]; nextCursor: string | null }> {
  const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  const rows = await db
    .select({
      id: starFeedPostsTable.id,
      kind: starFeedPostsTable.kind,
      title: starFeedPostsTable.title,
      body: starFeedPostsTable.body,
      metadata: starFeedPostsTable.metadata,
      media: starFeedPostsTable.media,
      status: starFeedPostsTable.status,
      visibility: starFeedPostsTable.visibility,
      createdAt: starFeedPostsTable.createdAt,
      authorUserId: usersTable.id,
      authorNickname: usersTable.nickname,
      authorProfileImageUrl: usersTable.profileImageUrl,
      authorStarProfileId: starFeedPostsTable.authorStarProfileId,
      authorStarDisplayName: starProfilesTable.displayName,
      authorStarImageUrl: starProfilesTable.imageUrl,
      authorStarStage: starProfilesTable.stage,
      targetStarProfileId: starFeedPostsTable.targetStarProfileId,
      targetStarDisplayName: targetStarProfilesTable.displayName,
      targetStarImageUrl: targetStarProfilesTable.imageUrl,
    })
    .from(starFeedPostsTable)
    .leftJoin(usersTable, eq(usersTable.id, starFeedPostsTable.authorUserId))
    .leftJoin(starProfilesTable, eq(starProfilesTable.id, starFeedPostsTable.authorStarProfileId))
    .leftJoin(targetStarProfilesTable, eq(targetStarProfilesTable.id, starFeedPostsTable.targetStarProfileId))
    .where(and(eq(starFeedPostsTable.authorUserId, authorUserId), ...(starProfileId ? [eq(starFeedPostsTable.authorStarProfileId, starProfileId)] : []), eq(starFeedPostsTable.visibility, "PUBLIC"), eq(starFeedPostsTable.status, "PUBLISHED"), ...(cursor ? [lt(starFeedPostsTable.createdAt, new Date(cursor))] : [])))
    .orderBy(desc(starFeedPostsTable.createdAt))
    .limit(safeLimit);
  const items = await decoratePosts(viewerUserId, rows);
  return { items, nextCursor: rows.length === safeLimit ? rows[rows.length - 1].createdAt.toISOString() : null };
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
  media?: Array<{ objectPath: string; mediaType: "image" | "video"; altText?: string }>;
  authorStarProfileId?: string | null;
  targetStarProfileId?: string | null;
}): Promise<CreateStarFeedPostResult> {
  const title = params.title?.trim() || (params.kind === "star" ? "공식 STAR 기록" : "팬 응원");
  const values = {
    authorUserId: params.userId,
    kind: params.kind,
    sourceKey: params.sourceKey ?? null,
    title,
    body: params.body,
    metadata: params.metadata ?? null,
    media: params.media ?? null,
    hashtags: normalizeHashtags(params.body),
    authorStarProfileId: params.authorStarProfileId ?? null,
    targetStarProfileId: params.targetStarProfileId ?? null,
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

export async function followStarProfile(userId: string, starProfileId: string): Promise<{ following: boolean }> {
  const [profile] = await db.select({ userId: starProfilesTable.userId }).from(starProfilesTable).where(eq(starProfilesTable.id, starProfileId)).limit(1);
  if (!profile) throw new Error("star_profile_not_found");
  if (profile.userId === userId) throw new Error("cannot_follow_own_star_profile");
  await db.insert(starProfileFollowsTable).values({ followerUserId: userId, starProfileId }).onConflictDoNothing();
  return { following: true };
}

export async function unfollowStarProfile(userId: string, starProfileId: string): Promise<{ following: boolean }> {
  await db.delete(starProfileFollowsTable).where(and(eq(starProfileFollowsTable.followerUserId, userId), eq(starProfileFollowsTable.starProfileId, starProfileId)));
  return { following: false };
}

export async function createStarPostActivities(post: StarFeedPostView): Promise<void> {
  const profileId = post.author.starProfile?.id;
  const actorUserId = post.author.id;
  if (!profileId || !actorUserId) return;
  await db.execute(sql`
    INSERT INTO star_feed_activities (user_id, actor_user_id, star_profile_id, post_id, type)
    SELECT follower_user_id, ${actorUserId}, ${profileId}, ${post.id}, 'star_post'
    FROM star_profile_follows
    WHERE star_profile_id = ${profileId} AND follower_user_id <> ${actorUserId}
  `);
}

export async function listStarFeedActivities(userId: string, limit = 30) {
  const rows = await db
    .select({
      id: starFeedActivitiesTable.id,
      type: starFeedActivitiesTable.type,
      createdAt: starFeedActivitiesTable.createdAt,
      readAt: starFeedActivitiesTable.readAt,
      postId: starFeedActivitiesTable.postId,
      displayName: starProfilesTable.displayName,
      imageUrl: starProfilesTable.imageUrl,
    })
    .from(starFeedActivitiesTable)
    .leftJoin(starProfilesTable, eq(starProfilesTable.id, starFeedActivitiesTable.starProfileId))
    .where(eq(starFeedActivitiesTable.userId, userId))
    .orderBy(desc(starFeedActivitiesTable.createdAt))
    .limit(Math.min(100, Math.max(1, Math.trunc(limit))));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null }));
}

export async function markStarFeedActivitiesRead(userId: string): Promise<void> {
  await db.update(starFeedActivitiesTable).set({ readAt: new Date() }).where(and(eq(starFeedActivitiesTable.userId, userId), sql`${starFeedActivitiesTable.readAt} IS NULL`));
}

export async function createStarFeedPost(params: {
  userId: string;
  kind: Extract<StarFeedPostKind, "fan" | "star">;
  title?: string | null;
  body: string;
  sourceKey?: string | null;
  metadata?: Record<string, unknown> | null;
  media?: Array<{ objectPath: string; mediaType: "image" | "video"; altText?: string }>;
  authorStarProfileId?: string | null;
  targetStarProfileId?: string | null;
}): Promise<StarFeedPostView> {
  const result = await createStarFeedPostWithResult(params);
  return result.post;
}

export async function reportStarFeedPost(params: { userId: string; postId: string; reason: string; details?: string }): Promise<boolean> {
  const post = await getStarFeedPost(params.userId, params.postId);
  if (!post) return false;
  await db.insert(starFeedReportsTable).values({ postId: params.postId, reporterUserId: params.userId, reason: params.reason, details: params.details ?? null }).onConflictDoNothing();
  await db.update(starFeedPostsTable).set({ status: "HIDDEN" }).where(eq(starFeedPostsTable.id, params.postId));
  return true;
}

export async function repostStarFeedPost(userId: string, postId: string): Promise<StarFeedPostView | null> {
  const source = await getStarFeedPost(userId, postId);
  if (!source) return null;
  const created = await db.insert(starFeedPostsTable).values({ authorUserId: userId, kind: "fan", sourceKey: `repost:${userId}:${postId}`, repostOfPostId: postId, title: `Repost · ${source.title}`, body: source.body, metadata: { repostOfPostId: postId, originalAuthor: source.author.nickname }, hashtags: source.metadata?.hashtags as string[] ?? [] }).onConflictDoNothing({ target: starFeedPostsTable.sourceKey }).returning({ id: starFeedPostsTable.id });
  const id = created[0]?.id ?? (await db.select({ id: starFeedPostsTable.id }).from(starFeedPostsTable).where(eq(starFeedPostsTable.sourceKey, `repost:${userId}:${postId}`)).limit(1))[0]?.id;
  return id ? getStarFeedPost(userId, id) : null;
}

export async function listStarResultDrafts(userId: string) {
  return db.select().from(starResultDraftsTable).where(eq(starResultDraftsTable.userId, userId)).orderBy(desc(starResultDraftsTable.createdAt)).limit(50);
}

export async function approveStarResultDraft(userId: string, draftId: string): Promise<StarFeedPostView | null> {
  const [draft] = await db.select().from(starResultDraftsTable).where(and(eq(starResultDraftsTable.id, draftId), eq(starResultDraftsTable.userId, userId))).limit(1);
  if (!draft || draft.status === "DISCARDED") return null;
  if (draft.publishedPostId) return getStarFeedPost(userId, draft.publishedPostId);
  const post = await createStarFeedPost({ userId, kind: "star", title: draft.title, body: draft.body, sourceKey: `result_draft:${draft.id}`, metadata: draft.metadata ?? undefined, authorStarProfileId: draft.starProfileId });
  await db.update(starResultDraftsTable).set({ status: "PUBLISHED", publishedPostId: post.id }).where(eq(starResultDraftsTable.id, draft.id));
  await createStarPostActivities(post);
  return post;
}

export async function discardStarResultDraft(userId: string, draftId: string): Promise<boolean> {
  const result = await db.update(starResultDraftsTable).set({ status: "DISCARDED" }).where(and(eq(starResultDraftsTable.id, draftId), eq(starResultDraftsTable.userId, userId), eq(starResultDraftsTable.status, "DRAFT"))).returning({ id: starResultDraftsTable.id });
  return result.length > 0;
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
