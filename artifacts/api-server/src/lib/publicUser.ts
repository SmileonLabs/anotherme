import type { User } from "@workspace/db";

export type PublicAccountKind = "user" | "official" | "system";

export function publicAccountKind(user: Pick<User, "clerkId">): PublicAccountKind {
  if (user.clerkId.startsWith("official:")) return "official";
  if (user.clerkId.startsWith("system:")) return "system";
  return "user";
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    nickname: user.nickname,
    accountKind: publicAccountKind(user),
    profileImageUrl: user.profileImageUrl ?? null,
    statusMessage: user.statusMessage ?? null,
  };
}
