import { describe, expect, it } from "vitest";
import {
  buildLinkPreviewFailureLog,
  buildLinkPreviewRoomFailureLog,
} from "./linkPreviewLogging";

describe("link preview failure log privacy", () => {
  it("keeps only origin and omits signed path, query, fragment and error text", () => {
    const signedUrl =
      "https://cdn.example.test/private/user/photo.jpg?X-Amz-Signature=TOP_SECRET#private-fragment";
    const error = Object.assign(
      new TypeError(`fetch failed for ${signedUrl}`),
      {
        code: "UND_ERR_CONNECT_TIMEOUT",
        cause: new Error(`upstream rejected ${signedUrl}`),
      },
    );

    const payload = buildLinkPreviewFailureLog(error, signedUrl, "message-1");
    const serialized = JSON.stringify(payload);

    expect(payload).toEqual({
      messageId: "message-1",
      targetOrigin: "https://cdn.example.test",
      errorName: "TypeError",
      errorCode: "UND_ERR_CONNECT_TIMEOUT",
    });
    for (const secret of [
      "/private/user/photo.jpg",
      "X-Amz-Signature",
      "TOP_SECRET",
      "private-fragment",
      "upstream rejected",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("does not copy attacker-controlled error names or publish error messages", () => {
    const error = {
      name: "Error https://signed.example/secret?token=LEAK",
      message: "token=LEAK",
      stack: "https://signed.example/secret?token=LEAK",
      code: "bad code token=LEAK",
    };

    expect(buildLinkPreviewRoomFailureLog(error, "room-1", "message-1"))
      .toEqual({
        roomId: "room-1",
        messageId: "message-1",
        errorName: "Error",
      });
  });
});
