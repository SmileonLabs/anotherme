import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { customFetch, setCharacterProfileIdGetter } from "@workspace/api-client-react";
import { playModeQueryKey } from "./usePlayMode";
import {
  CHARACTER_PROFILES_ROOT_KEY,
  prepareProfileStateTransition,
} from "@/lib/profileQueryIsolation";

export type CharacterProfileType = "fan" | "star" | "official_ai";
export type CharacterProfileStatus = "active" | "locked" | "torimia" | "archived";

export interface CharacterProfileView {
  id: string;
  type: CharacterProfileType;
  handle: string;
  displayName: string;
  profileImageUrl: string | null;
  statusMessage: string | null;
  status: CharacterProfileStatus;
  level: number;
  xp: number;
  jobKey: string | null;
  jobStage: number;
  stats: Record<string, number>;
  metadata: Record<string, unknown>;
  isActive: boolean;
}

export interface CharacterProfileState {
  activeProfile: CharacterProfileView;
  profiles: CharacterProfileView[];
}

export const characterProfilesQueryKey = [CHARACTER_PROFILES_ROOT_KEY] as const;
const characterProfileTransitionScope = { id: "character-profile-transition" } as const;

export function useCharacterProfiles() {
  const queryClient = useQueryClient();
  const commitProfileState = React.useCallback(
    async (state: CharacterProfileState) => {
      const previous = queryClient.getQueryData<CharacterProfileState>(
        characterProfilesQueryKey,
      )?.activeProfile.id;
      const switched = prepareProfileStateTransition(
        queryClient,
        previous,
        state.activeProfile.id,
        (profileId) => setCharacterProfileIdGetter(() => profileId),
      );
      queryClient.setQueryData(characterProfilesQueryKey, state);

      if (switched) {
        await queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] !== characterProfilesQueryKey[0],
          refetchType: "active",
        });
      }
    },
    [queryClient],
  );
  const query = useQuery({
    queryKey: characterProfilesQueryKey,
    queryFn: async () => {
      const state = await customFetch<CharacterProfileState>("/api/users/me/profiles", {
        responseType: "json",
      });
      const previous = queryClient.getQueryData<CharacterProfileState>(
        characterProfilesQueryKey,
      )?.activeProfile.id;
      prepareProfileStateTransition(
        queryClient,
        previous,
        state.activeProfile.id,
        (profileId) => setCharacterProfileIdGetter(() => profileId),
      );
      return state;
    },
  });
  const activation = useMutation({
    scope: characterProfileTransitionScope,
    mutationFn: (profileId: string) =>
      customFetch<CharacterProfileState>("/api/users/me/active-profile", {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify({ profileId }),
      }),
    onSuccess: async (state) => {
      await commitProfileState(state);
    },
  });
  const update = useMutation({
    mutationFn: ({ profileId, ...body }: { profileId: string; displayName?: string; profileImageUrl?: string | null; statusMessage?: string | null }) =>
      customFetch<CharacterProfileState>(`/api/users/me/profiles/${profileId}`, {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify(body),
      }),
    onSuccess: (state) => queryClient.setQueryData(characterProfilesQueryKey, state),
  });
  const createFan = useMutation({
    scope: characterProfileTransitionScope,
    mutationFn: (body: { displayName: string; handle?: string; profileImageUrl?: string | null; customizeDefault?: boolean; customization: Record<string, unknown> }) =>
      customFetch<CharacterProfileState>("/api/users/me/fan-profiles", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(body),
      }),
    onSuccess: async (state) => {
      await commitProfileState(state);
      await queryClient.invalidateQueries({ queryKey: playModeQueryKey });
    },
  });
  const archive = useMutation({
    scope: characterProfileTransitionScope,
    mutationFn: (profileId: string) => customFetch<CharacterProfileState>(`/api/users/me/profiles/${profileId}`, { method: "DELETE", responseType: "json" }),
    onSuccess: async (state) => {
      await commitProfileState(state);
      await queryClient.invalidateQueries({ queryKey: playModeQueryKey });
    },
  });

  return {
    state: query.data,
    activeProfile: query.data?.activeProfile ?? null,
    profiles: query.data?.profiles ?? [],
    fanProfiles: query.data?.profiles.filter((profile) => profile.type === "fan") ?? [],
    starProfiles: query.data?.profiles.filter((profile) => profile.type === "star") ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isActivating: activation.isPending,
    isUpdating: update.isPending,
    isCreatingFan: createFan.isPending,
    isArchiving: archive.isPending,
    refetch: query.refetch,
    activateProfile: activation.mutateAsync,
    updateProfile: update.mutateAsync,
    createFanProfile: createFan.mutateAsync,
    archiveProfile: archive.mutateAsync,
  };
}
