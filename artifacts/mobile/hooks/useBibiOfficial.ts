import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListRoomsQueryKey } from "@workspace/api-client-react";

export interface BibiOfficialAccount {
  id: string;
  email: string;
  nickname: string;
  displayName: string;
  handle: string;
  profileImageUrl: string | null;
  statusMessage: string | null;
}

export interface BibiOfficialRoomResponse {
  account: BibiOfficialAccount;
  room: { id: string };
}

export const bibiOfficialQueryKey = ["official-accounts", "bibi"] as const;

export function useBibiOfficial() {
  return useQuery({
    queryKey: bibiOfficialQueryKey,
    queryFn: () => customFetch<BibiOfficialAccount>("/api/official-accounts/bibi", { responseType: "json" }),
  });
}

export function useOpenBibiOfficialRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      customFetch<BibiOfficialRoomResponse>("/api/official-accounts/bibi/room", {
        method: "POST",
        responseType: "json",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListRoomsQueryKey() });
    },
  });
}
