import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type PlayMode = "fan" | "star";

export interface FanProfileState {
  level: number;
  xp: number;
  stats: {
    fanPower: number;
    supportPower: number;
    empathy: number;
    story: number;
  };
}

export interface PlayModeState {
  currentMode: PlayMode;
  starUnlocked: boolean;
  fanProfile: FanProfileState;
  equippedStar: {
    id: string;
    starKey: string;
    displayName: string;
    tokenId: string;
    contractAddress: string;
    chainId: number;
    imageUrl: string | null;
    stage: "aspiring" | "promoted";
    level: number;
    xp: number;
    stats: {
      charm: number;
      stagePresence: number;
      bond: number;
      lore: number;
    };
    equippedAt: string | null;
    verifiedAt: string | null;
    torimiaOpenedAt: string | null;
    promotedAt: string | null;
  } | null;
}

export const playModeQueryKey = ["play-mode"] as const;

export function usePlayMode() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: playModeQueryKey,
    queryFn: () =>
      customFetch<PlayModeState>("/api/users/me/play-mode", {
        responseType: "json",
      }),
  });

  const mutation = useMutation({
    mutationFn: (mode: PlayMode) =>
      customFetch<PlayModeState>("/api/users/me/play-mode", {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify({ mode }),
      }),
    onSuccess: (data) => queryClient.setQueryData(playModeQueryKey, data),
  });

  return {
    state: query.data,
    mode: query.data?.currentMode ?? "fan",
    fanProfile: query.data?.fanProfile,
    equippedStar: query.data?.equippedStar ?? null,
    starUnlocked: query.data?.starUnlocked ?? false,
    isLoading: query.isLoading,
    isChanging: mutation.isPending,
    refetch: query.refetch,
    setMode: mutation.mutateAsync,
  };
}
