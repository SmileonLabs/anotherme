import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, setCharacterProfileIdGetter } from "@workspace/api-client-react";
import { playModeQueryKey } from "./usePlayMode";

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

export const characterProfilesQueryKey = ["character-profiles"] as const;

export function useCharacterProfiles() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: characterProfilesQueryKey,
    queryFn: () =>
      customFetch<CharacterProfileState>("/api/users/me/profiles", {
        responseType: "json",
      }),
  });
  const activation = useMutation({
    mutationFn: (profileId: string) =>
      customFetch<CharacterProfileState>("/api/users/me/active-profile", {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify({ profileId }),
      }),
    onSuccess: async (state) => {
      queryClient.setQueryData(characterProfilesQueryKey, state);
      await queryClient.invalidateQueries({ queryKey: playModeQueryKey });
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
    mutationFn: (body: { displayName: string; handle?: string; profileImageUrl?: string | null; customization: { ageStyle: string; hairStyle: string; skinTone: string; genderExpression: string } & Record<string, unknown> }) =>
      customFetch<CharacterProfileState>("/api/users/me/fan-profiles", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(body),
      }),
    onSuccess: async (state) => {
      setCharacterProfileIdGetter(() => state.activeProfile.id);
      queryClient.setQueryData(characterProfilesQueryKey, state);
      await queryClient.invalidateQueries({ queryKey: playModeQueryKey });
    },
  });
  const archive = useMutation({
    mutationFn: (profileId: string) => customFetch<CharacterProfileState>(`/api/users/me/profiles/${profileId}`, { method: "DELETE", responseType: "json" }),
    onSuccess: async (state) => {
      setCharacterProfileIdGetter(() => state.activeProfile.id);
      queryClient.setQueryData(characterProfilesQueryKey, state);
      await queryClient.invalidateQueries({ queryKey: playModeQueryKey });
    },
  });

  if (query.data?.activeProfile.id) {
    const profileId = query.data.activeProfile.id;
    setCharacterProfileIdGetter(() => profileId);
  }

  return {
    state: query.data,
    activeProfile: query.data?.activeProfile ?? null,
    profiles: query.data?.profiles ?? [],
    fanProfiles: query.data?.profiles.filter((profile) => profile.type === "fan") ?? [],
    starProfiles: query.data?.profiles.filter((profile) => profile.type === "star") ?? [],
    isLoading: query.isLoading,
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
