import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export const starFeedQueryKey = ["star-feed", "posts"] as const;
const starFeedScopeQueryKey = (scope: "recommended" | "following") => [...starFeedQueryKey, scope] as const;

function replacePost(posts: StarFeedPost[] | undefined, post: StarFeedPost): StarFeedPost[] {
  if (!posts) return [post];
  return posts.map((item) => (item.id === post.id ? post : item));
}

export function useStarFeed(scope: "recommended" | "following" = "recommended") {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: starFeedScopeQueryKey(scope),
    queryFn: () =>
      customFetch<StarFeedPost[]>(`/api/star-feed/posts?scope=${scope}`, {
        responseType: "json",
      }),
  });

  const createPostMutation = useMutation({
    mutationFn: ({ kind, body, media = [], targetStarProfileId = null }: { kind: StarFeedWritableKind; body: string; media?: StarFeedPost["media"]; targetStarProfileId?: string | null }) =>
      customFetch<StarFeedPost>("/api/star-feed/posts", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ kind, body, media, targetStarProfileId }),
      }),
    onSuccess: (post) => {
      queryClient.setQueryData<StarFeedPost[]>(starFeedScopeQueryKey(scope), (posts) => [post, ...(posts ?? [])]);
      void queryClient.invalidateQueries({ queryKey: ["play-mode"] });
    },
  });

  const cheerMutation = useMutation({
    mutationFn: (postId: string) =>
      customFetch<StarFeedPost>(`/api/star-feed/posts/${postId}/reactions`, {
        method: "POST",
        responseType: "json",
      }),
    onSuccess: (post) => {
      queryClient.setQueryData<StarFeedPost[]>(starFeedScopeQueryKey(scope), (posts) => replacePost(posts, post));
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
      queryClient.setQueryData<StarFeedPost[]>(starFeedScopeQueryKey(scope), (posts) => replacePost(posts, post));
    },
  });

  const followMutation = useMutation({
    mutationFn: ({ starProfileId, following }: { starProfileId: string; following: boolean }) =>
      customFetch<{ following: boolean }>(`/api/star-feed/star-profiles/${starProfileId}/follow`, {
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
  const repostMutation = useMutation({
    mutationFn: (postId: string) => customFetch<StarFeedPost>(`/api/star-feed/posts/${postId}/repost`, { method: "POST", responseType: "json" }),
    onSuccess: (post) => queryClient.setQueryData<StarFeedPost[]>(starFeedScopeQueryKey(scope), (posts) => [post, ...(posts ?? [])]),
  });

  return {
    posts: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
    createPost: createPostMutation.mutateAsync,
    cheerPost: cheerMutation.mutateAsync,
    commentPost: commentMutation.mutateAsync,
    setStarFollowing: followMutation.mutateAsync,
    reportPost: reportMutation.mutateAsync,
    repostPost: repostMutation.mutateAsync,
    resultDrafts: draftsQuery.data ?? [],
    approveResultDraft: approveDraftMutation.mutateAsync,
    discardResultDraft: discardDraftMutation.mutateAsync,
    isCreatingPost: createPostMutation.isPending,
    isCheering: cheerMutation.isPending,
    isCommenting: commentMutation.isPending,
    isSettingStarFollowing: followMutation.isPending,
    isReportingPost: reportMutation.isPending,
    isRepostingPost: repostMutation.isPending,
    isResolvingResultDraft: approveDraftMutation.isPending || discardDraftMutation.isPending,
  };
}
