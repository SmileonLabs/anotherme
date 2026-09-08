import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  getFetchRoomMessagesQueryKey,
  getGetRoomQueryKey,
  getListRoomsQueryKey,
} from "@workspace/api-client-react";

export type AnotherMeRelationshipType = "FRIEND" | "FAMILY" | "WORK" | "PARTNER" | "UNKNOWN" | "CUSTOM";
export type AnotherMeToneSyncLevel = "LOW" | "MEDIUM" | "HIGH";
export type AnotherMeSessionStatus = "ACTIVE" | "DISMISSED_BY_OWNER" | "DISMISSED_BY_CALLER" | "EXPIRED" | "FAILED";

export interface AnotherMeSettings {
  summonEnabled: boolean;
  defaultWaitMinutes: number;
  allowFriends: boolean;
  allowFamily: boolean;
  allowWork: boolean;
  allowUnknown: boolean;
  autoReplyEnabled: boolean;
  sensitiveReplyBlocked: boolean;
  toneSyncEnabled: boolean;
  defaultToneSyncLevel: AnotherMeToneSyncLevel;
}

export interface AnotherMeRoomSettings {
  roomId: string;
  summonEnabled: boolean | null;
  waitMinutes: number | null;
  toneSyncLevel: AnotherMeToneSyncLevel | null;
  relationshipType: AnotherMeRelationshipType;
  autoReplyLevel: string;
}

export interface AnotherMeSession {
  id: string;
  ownerUserId: string;
  summonedByUserId: string;
  roomId: string;
  status: AnotherMeSessionStatus;
  summonedAt: string;
  dismissedAt: string | null;
  dismissedByUserId: string | null;
  lastActivityAt: string;
  expiresAt: string;
  reason: string | null;
  ownerName: string | null;
  summonedByName: string | null;
  isOwner: boolean;
  isCaller: boolean;
  canDismiss: boolean;
}

export interface AnotherMeSummonStatus {
  canSummon: boolean;
  reason: string | null;
  waitMinutes: number;
  remainingSeconds: number;
  targetUserId: string;
  targetUserName: string | null;
  activeSession: AnotherMeSession | null;
}

export const anotherMeSettingsQueryKey = ["another-me", "settings"] as const;
export const anotherMeRoomSettingsQueryKey = (roomId: string) => ["another-me", "room-settings", roomId] as const;
export const anotherMeSummonStatusQueryKey = (roomId: string, targetUserId: string) =>
  ["another-me", "summon-status", roomId, targetUserId] as const;

function invalidateRoom(queryClient: ReturnType<typeof useQueryClient>, roomId: string) {
  queryClient.invalidateQueries({ queryKey: getFetchRoomMessagesQueryKey(roomId) });
  queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) });
  queryClient.invalidateQueries({ queryKey: getListRoomsQueryKey() });
  queryClient.invalidateQueries({ queryKey: ["another-me"] });
}

export function useAnotherMeSettings() {
  return useQuery({
    queryKey: anotherMeSettingsQueryKey,
    queryFn: () => customFetch<AnotherMeSettings>("/api/another-me/settings", { responseType: "json" }),
  });
}

export function useUpdateAnotherMeSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<AnotherMeSettings>) =>
      customFetch<AnotherMeSettings>("/api/another-me/settings", {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify(body),
      }),
    onSuccess: (settings) => {
      queryClient.setQueryData(anotherMeSettingsQueryKey, settings);
      queryClient.invalidateQueries({ queryKey: ["another-me"] });
    },
  });
}

export function useAnotherMeRoomSettings(roomId: string | undefined) {
  return useQuery({
    enabled: !!roomId,
    queryKey: anotherMeRoomSettingsQueryKey(roomId ?? ""),
    queryFn: () => customFetch<AnotherMeRoomSettings>(`/api/another-me/rooms/${roomId}/settings`, { responseType: "json" }),
  });
}

export function useUpdateAnotherMeRoomSettings(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Omit<AnotherMeRoomSettings, "roomId">>) =>
      customFetch<AnotherMeRoomSettings>(`/api/another-me/rooms/${roomId}/settings`, {
        method: "PATCH",
        responseType: "json",
        body: JSON.stringify(body),
      }),
    onSuccess: (settings) => {
      queryClient.setQueryData(anotherMeRoomSettingsQueryKey(roomId), settings);
      queryClient.invalidateQueries({ queryKey: ["another-me"] });
    },
  });
}

export function useAnotherMeSummonStatus(roomId: string | undefined, targetUserId: string | undefined, enabled = true) {
  return useQuery({
    enabled: enabled && !!roomId && !!targetUserId,
    queryKey: anotherMeSummonStatusQueryKey(roomId ?? "", targetUserId ?? ""),
    refetchInterval: 15_000,
    queryFn: () =>
      customFetch<AnotherMeSummonStatus>(
        `/api/another-me/summon/status?roomId=${encodeURIComponent(roomId ?? "")}&targetUserId=${encodeURIComponent(targetUserId ?? "")}`,
        { responseType: "json" },
      ),
  });
}

export function useSummonAnotherMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { roomId: string; targetUserId: string }) =>
      customFetch<AnotherMeSession>("/api/another-me/summon", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(body),
      }),
    onSuccess: (session) => invalidateRoom(queryClient, session.roomId),
  });
}

export function useDismissAnotherMeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      customFetch<AnotherMeSession>(`/api/another-me/summon/${sessionId}/dismiss`, { method: "POST", responseType: "json" }),
    onSuccess: (session) => invalidateRoom(queryClient, session.roomId),
  });
}

export function useGenerateAnotherMeToneProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (relationshipType: AnotherMeRelationshipType) =>
      customFetch("/api/another-me/tone-profile/generate", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify({ relationshipType }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["another-me"] }),
  });
}
