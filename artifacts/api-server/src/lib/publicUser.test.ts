import { describe, expect, it } from "vitest";
import type { User } from "@workspace/db";
import { publicAccountKind, toPublicUser } from "./publicUser";

function user(clerkId: string): User {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    clerkId,
    email: "private@example.com",
    nickname: "테스터",
    profileImageUrl: null,
    statusMessage: null,
  } as User;
}

describe("public user privacy", () => {
  it("never serializes email or clerk id", () => {
    const result = toPublicUser(user("clerk:user"));
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("clerkId");
    expect(result.accountKind).toBe("user");
  });

  it("never exposes the legacy account photo as a public avatar", () => {
    const account = user("clerk:user");
    account.profileImageUrl = "/objects/private-account-photo.jpg";
    expect(toPublicUser(account).profileImageUrl).toBeNull();
  });

  it("classifies non-human accounts without exposing their identifiers", () => {
    expect(publicAccountKind(user("official:bibi"))).toBe("official");
    expect(publicAccountKind(user("system:dungeon-master"))).toBe("system");
  });
});
