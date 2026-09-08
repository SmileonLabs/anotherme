import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type StarFeedPostKind = "official" | "event" | "fan" | "star" | "growth" | "profile_update" | "talk_diary";
export type StarFeedWritableKind = Extract<StarFeedPostKind, "fan" | "star">;

export interface StarFeedAuthor {
  id: string | null;
  nickname: string;
  profileImageUrl: string | null;
  activityProfile: { id: string; type: string; handle: string; displayName: string; profileImageUrl: string | null } | null;
  starProfile: { id: string; displayName: string; imageUrl: string | null; stage: string; followedByMe: boolean } | null;
}

export interface StarFeedComment {
  id: string;
  body: string;
  createdAt: string;
  author: StarFeedAuthor;
}

export interface StarFeedPost {
  id: string;
  kind: StarFeedPostKind;
  title: string;
  body: string;
  metadata?: Record<string, unknown> | null;
  hashtags: string[];
  media: Array<{ objectPath: string; mediaType: "image" | "video"; altText?: string }>;
  status: string;
  visibility?: string;
  createdAt: string;
  author: StarFeedAuthor;
  targetStarProfile: { id: string; displayName: string; imageUrl: string | null } | null;
  reactionCount: number;
  commentCount: number;
  reactedByMe: boolean;
  recentComments: StarFeedComment[];
}

export interface StarResultDraft { id: string; title: string; body: string; status: string; createdAt: string; }
export interface StarFeedPage { items: StarFeedPost[]; nextCursor: string | null; }
export interface StarFeedCreateResult {
  post: StarFeedPost;
  reward: { granted: boolean; xp: number; stat: string } | null;
}
type StarFeedListWireResponse = StarFeedPage | StarFeedPost[];
type StarFeedCreateWireResponse = StarFeedCreateResult | StarFeedPost;

export const starFeedQueryKey = ["star-feed", "posts"] as const;
const starFeedScopeQueryKey = (scope: "recommended" | "following") => [...starFeedQueryKey, scope] as const;

function replacePost(data: InfiniteData<StarFeedPage> | undefined, post: StarFeedPost): InfiniteData<StarFeedPage> {
  if (!data) return { pages: [{ items: [post], nextCursor: null }], pageParams: [undefined] };
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => item.id === post.id ? post : item) })) };
}

function prependPost(data: InfiniteData<StarFeedPage> | undefined, post: StarFeedPost): InfiniteData<StarFeedPage> {
  if (!data) return { pages: [{ items: [post], nextCursor: null }], pageParams: [undefined] };
  const [first, ...rest] = data.pages;
  return { ...data, pages: [{ ...first, items: [post, ...first.items.filter((item) => item.id !== post.id)] }, ...rest] };
}

export function useStarFeed(scope: "recommended" | "following" = "recommended") {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: starFeedScopeQueryKey(scope),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const response = await customFetch<StarFeedListWireResponse>(`/api/star-feed/posts?scope=${scope}&limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, {
        responseType: "json",
      });
      return Array.isArray(response)
        ? { items: response.filter(Boolean), nextCursor: null }
        : {
            items: Array.isArray(response.items) ? response.items.filter(Boolean) : [],
            nextCursor: typeof response.nextCursor === "string" ? response.nextCursor : null,
          };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const createPostMutation = useMutation({
    mutationFn: async ({ kind, body, media = [], targetStarProfileId = null }: { kind: StarFeedWritableKind; body: string; media?: StarFeedPost["media"]; targetStarProfileId?: string | null }) => {
      const response = await customFetch<StarFeedCreateWireResponse>("/api/star-feed/posts", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ kind, body, media, targetStarProfileId }),
      });
      return "post" in response
        ? response
        : { post: response, reward: null };
    },
    onSuccess: ({ post }) => {
      queryClient.setQueryData<InfiniteData<StarFeedPage>>(starFeedScopeQueryKey(scope), (data) => prependPost(data, post));
      void queryClient.invalidateQueries({ queryKey: ["play-mode"] });
    },
  });

  const cheerMutation = useMutation({
    mutationFn: ({ postId, reacted }: { postId: string; reacted: boolean }) =>
      customFetch<StarFeedPost>(`/api/star-feed/posts/${postId}/reactions`, {
        method: reacted ? "DELETE" : "POST",
        responseType: "json",
      }),
    onSuccess: (post) => {
      queryClient.setQueryData<InfiniteData<StarFeedPage>>(starFeedScopeQueryKey(scope), (data) => replacePost(data, post));
    },
  });

  const commentMutation = useMutation({
    mutationFn: ({ postId, body }: { postId: string; body: string }) =>
      customFetch<StarFeedPost>(`/api/star-feed/posts/${postId}/comments`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ body }),
      }),
    onSuccess: (post) => {
      queryClient.setQueryData<InfiniteData<StarFeedPage>>(starFeedScopeQueryKey(scope), (data) => replacePost(data, post));
    },
  });

  const followMutation = useMutation({
    mutationFn: ({ profileId, following }: { profileId: string; following: boolean }) =>
      customFetch<{ following: boolean }>(`/api/star-feed/star-profiles/${profileId}/follow`, {
        method: following ? "DELETE" : "POST",
        responseType: "json",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: starFeedQueryKey }),
  });

  const draftsQuery = useQuery({ queryKey: ["star-feed", "result-drafts"], queryFn: () => customFetch<StarResultDraft[]>("/api/star-feed/result-drafts", { responseType: "json" }) });
  const approveDraftMutation = useMutation({
    mutationFn: (id: string) => customFetch<StarFeedPost>(`/api/star-feed/result-drafts/${id}/approve`, { method: "POST", responseType: "json" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: starFeedQueryKey }),
  });
  const discardDraftMutation = useMutation({
    mutationFn: (id: string) => customFetch<void>(`/api/star-feed/result-drafts/${id}/discard`, { method: "POST", responseType: "json" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["star-feed", "result-drafts"] }),
  });

  const reportMutation = useMutation({
    mutationFn: ({ postId, reason }: { postId: string; reason: "spam" | "harassment" | "sexual" | "violence" | "copyright" | "other" }) =>
      customFetch<{ reported: true }>(`/api/star-feed/posts/${postId}/reports`, {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: starFeedQueryKey }),
  });
  return {
    posts: query.data?.pages.flatMap((page) => page.items) ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
    createPost: createPostMutation.mutateAsync,
    cheerPost: (postId: string) => cheerMutation.mutateAsync({ postId, reacted: false }),
    toggleReaction: cheerMutation.mutateAsync,
    commentPost: commentMutation.mutateAsync,
    setStarFollowing: followMutation.mutateAsync,
    reportPost: reportMutation.mutateAsync,
    resultDrafts: draftsQuery.data ?? [],
    approveResultDraft: approveDraftMutation.mutateAsync,
    discardResultDraft: discardDraftMutation.mutateAsync,
    isCreatingPost: createPostMutation.isPending,
    isCheering: cheerMutation.isPending,
    isCommenting: commentMutation.isPending,
    isSettingStarFollowing: followMutation.isPending,
    isReportingPost: reportMutation.isPending,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isResolvingResultDraft: approveDraftMutation.isPending || discardDraftMutation.isPending,
  };
}
