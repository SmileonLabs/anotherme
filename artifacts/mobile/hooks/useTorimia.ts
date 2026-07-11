import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { playModeQueryKey, type PlayModeState } from "@/hooks/usePlayMode";

export interface TorimiaRequirement {
  key: "level" | "missions" | "charm" | "stagePresence" | "bond" | "lore";
  label: string;
  current: number;
  target: number;
  met: boolean;
}

export interface TorimiaState {
  star: PlayModeState["equippedStar"];
  opened: boolean;
  promoted: boolean;
  canOpen: boolean;
  requirements: TorimiaRequirement[];
}

export const torimiaQueryKey = ["torimia"] as const;

export function useTorimia() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: torimiaQueryKey,
    queryFn: () =>
      customFetch<TorimiaState>("/api/users/me/torimia", {
        responseType: "json",
      }),
  });

  const openMutation = useMutation({
    mutationFn: () =>
      customFetch<TorimiaState>("/api/users/me/torimia/open", {
        method: "POST",
        responseType: "json",
      }),
    onSuccess: (state) => {
      queryClient.setQueryData(torimiaQueryKey, state);
      queryClient.invalidateQueries({ queryKey: playModeQueryKey });
    },
  });

  return {
    state: query.data,
    requirements: query.data?.requirements ?? [],
    isLoading: query.isLoading,
    isOpening: openMutation.isPending,
    refetch: query.refetch,
    openTorimia: openMutation.mutateAsync,
  };
}
