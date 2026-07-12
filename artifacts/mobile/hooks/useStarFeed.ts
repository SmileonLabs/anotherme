import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type StarFeedPostKind = "official" | "event" | "fan" | "star" | "growth" | "profile_update" | "talk_diary";
export type StarFeedWritableKind = Extract<StarFeedPostKind, "fan" | "star">;

export interface StarFeedAuthor {
  id: string | null;
  nickname: string;
  profileImageUrl: string | null;
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
  visibility?: string;
  createdAt: string;
  author: StarFeedAuthor;
  reactionCount: number;
  commentCount: number;
  reactedByMe: boolean;
  recentComments: StarFeedComment[];
}

export const starFeedQueryKey = ["star-feed", "posts"] as const;

function replacePost(posts: StarFeedPost[] | undefined, post: StarFeedPost): StarFeedPost[] {
  if (!posts) return [post];
  return posts.map((item) => (item.id === post.id ? post : item));
}

export function useStarFeed() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: starFeedQueryKey,
    queryFn: () =>
      customFetch<StarFeedPost[]>("/api/star-feed/posts", {
        responseType: "json",
      }),
  });

  const createPostMutation = useMutation({
    mutationFn: ({ kind, body }: { kind: StarFeedWritableKind; body: string }) =>
      customFetch<StarFeedPost>("/api/star-feed/posts", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ kind, body }),
      }),
    onSuccess: (post) => {
      queryClient.setQueryData<StarFeedPost[]>(starFeedQueryKey, (posts) => [post, ...(posts ?? [])]);
    },
  });

  const cheerMutation = useMutation({
    mutationFn: (postId: string) =>
      customFetch<StarFeedPost>(`/api/star-feed/posts/${postId}/reactions`, {
        method: "POST",
        responseType: "json",
      }),
    onSuccess: (post) => {
      queryClient.setQueryData<StarFeedPost[]>(starFeedQueryKey, (posts) => replacePost(posts, post));
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
      queryClient.setQueryData<StarFeedPost[]>(starFeedQueryKey, (posts) => replacePost(posts, post));
    },
  });

  return {
    posts: query.data ?? [],
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: query.refetch,
    createPost: createPostMutation.mutateAsync,
    cheerPost: cheerMutation.mutateAsync,
    commentPost: commentMutation.mutateAsync,
    isCreatingPost: createPostMutation.isPending,
    isCheering: cheerMutation.isPending,
    isCommenting: commentMutation.isPending,
  };
}
