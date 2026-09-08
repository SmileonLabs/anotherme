import { customFetch } from "@workspace/api-client-react";

export type DisplayUser = {
  id?: string;
  nickname?: string | null;
  displayName?: string | null;
  friendAlias?: string | null;
};

export function userDisplayName(user: DisplayUser | null | undefined, fallback = "사용자"): string {
  const name = user?.displayName || user?.friendAlias || user?.nickname;
  return name?.trim() || fallback;
}

export async function updateFriendAlias(friendId: string, alias: string | null): Promise<DisplayUser> {
  return customFetch<DisplayUser>(`/api/friends/${friendId}/alias`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alias }),
  });
}
