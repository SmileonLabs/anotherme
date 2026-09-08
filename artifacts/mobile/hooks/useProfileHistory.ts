import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type ProfileHistoryKind = "profile_image" | "status_message" | "profile_update";

export interface ProfileHistoryItem {
  id: string;
  userId: string;
  kind: ProfileHistoryKind;
  oldProfileImageUrl: string | null;
  newProfileImageUrl: string | null;
  oldStatusMessage: string | null;
  newStatusMessage: string | null;
  feedPostId: string | null;
  isVisible: boolean;
  createdAt: string;
}

export const profileHistoryQueryKey = ["users", "me", "profile-history"] as const;

export function useProfileHistory() {
  return useQuery({
    queryKey: profileHistoryQueryKey,
    queryFn: () => customFetch<ProfileHistoryItem[]>("/api/users/me/profile-history"),
  });
}
