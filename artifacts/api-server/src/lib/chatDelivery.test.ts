import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://anotherme:test@127.0.0.1:5432/anotherme";

const { selectChatDeliveryRecipients } = await import("./chatDelivery");

describe("chat delivery selection", () => {
  it("keeps muted members realtime while suppressing their OS push", () => {
    const recipients = selectChatDeliveryRecipients(
      [
        { userId: "sender", muted: false },
        { userId: "muted", muted: true },
        { userId: "active", muted: false },
        { userId: "blocked", muted: false },
      ],
      "sender",
      new Set(["blocked"]),
    );

    expect(recipients.realtimeUserIds).toEqual(["sender", "muted", "active"]);
    expect(recipients.pushUserIds).toEqual(["active"]);
  });
});
