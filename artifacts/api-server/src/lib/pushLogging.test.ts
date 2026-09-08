import { describe, expect, it } from "vitest";
import { buildPushFailureLog } from "./pushLogging";

describe("push provider failure log privacy", () => {
  it("omits a web-push capability endpoint, headers, response body, message and stack", () => {
    const endpoint = "https://push.example.test/send/TOP_SECRET_ENDPOINT";
    const error = Object.assign(new Error(`push failed for ${endpoint}`), {
      name: "WebPushError",
      statusCode: 503,
      code: "ECONNRESET",
      endpoint,
      headers: { authorization: "Bearer TOP_SECRET_AUTH" },
      body: "TOP_SECRET_RESPONSE_BODY",
      stack: `Error: TOP_SECRET_STACK at ${endpoint}`,
    });

    const payload = buildPushFailureLog(error);
    const serialized = JSON.stringify(payload);

    expect(payload).toEqual({
      errorName: "WebPushError",
      errorCode: "ECONNRESET",
      statusCode: 503,
    });
    for (const secret of [
      "TOP_SECRET_ENDPOINT",
      "TOP_SECRET_AUTH",
      "TOP_SECRET_RESPONSE_BODY",
      "TOP_SECRET_STACK",
      "push.example.test",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("keeps a Firebase category but omits the registration token and provider metadata", () => {
    const token = "TOP_SECRET_FCM_REGISTRATION_TOKEN";
    const error = {
      name: "FirebaseMessagingError",
      message: `registration token ${token} was rejected`,
      stack: `FirebaseMessagingError: ${token}`,
      errorInfo: {
        code: "messaging/internal-error",
        message: `provider echoed ${token}`,
      },
      token,
    };

    const payload = buildPushFailureLog(error);
    const serialized = JSON.stringify(payload);

    expect(payload).toEqual({
      errorName: "FirebaseMessagingError",
      errorCode: "messaging/internal-error",
    });
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain("provider echoed");
  });

  it("rejects attacker-controlled category fields instead of copying them", () => {
    const secret = "https://push.example.test/secret?token=LEAK";
    expect(buildPushFailureLog({
      name: `Error ${secret}`,
      code: `bad code ${secret}`,
      statusCode: secret,
    })).toEqual({ errorName: "Error" });
  });
});
