import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiError,
  customFetch,
  RequestTimeoutError,
  ResponseParseError,
  setAuthTokenGetter,
  setCharacterProfileIdGetter,
  StaleRequestContextError,
} from "./custom-fetch.ts";

function stalledResponse(signal) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    url: "https://example.invalid/slow",
    headers: new Headers({ "content-type": "application/json" }),
    body: {},
    text() {
      return new Promise((_, reject) => {
        if (signal.aborted) {
          reject(new DOMException("aborted", "AbortError"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      });
    },
  };
}

test("deadline remains active while a response body is stalled", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (_input, init) => stalledResponse(init.signal);

  await assert.rejects(
    customFetch("https://example.invalid/slow", {
      responseType: "json",
      timeoutMs: 15,
      requestId: "request-body-timeout",
    }),
    (error) =>
      error instanceof RequestTimeoutError &&
      error.requestId === "request-body-timeout" &&
      error.timeoutMs === 15,
  );
});

test("caller cancellation is not mislabeled as a timeout", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (_input, init) => stalledResponse(init.signal);
  const controller = new AbortController();
  const request = customFetch("https://example.invalid/cancelled", {
    responseType: "json",
    timeoutMs: 5_000,
    signal: controller.signal,
  });
  controller.abort();

  await assert.rejects(
    request,
    (error) => error instanceof DOMException && error.name === "AbortError",
  );
});

test("the deadline covers auth token acquisition and redacts the timeout URL", async (t) => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  t.after(() => {
    setAuthTokenGetter(null);
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response("{}");
  };
  setAuthTokenGetter(() => new Promise(() => {}));

  await assert.rejects(
    customFetch("https://example.invalid/private?token=do-not-log#fragment", {
      timeoutMs: 15,
    }),
    (error) => {
      assert.ok(error instanceof RequestTimeoutError);
      assert.equal(error.url, "https://example.invalid/private");
      assert.equal(error.message.includes("do-not-log"), false);
      assert.equal(JSON.stringify(error).includes("do-not-log"), false);
      return true;
    },
  );
  assert.equal(fetchCalled, false);
});

test("the deadline returns when a response body implementation ignores abort", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const response = new Response("{}", {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  response.text = () => new Promise(() => {});
  globalThis.fetch = async () => response;

  await assert.rejects(
    customFetch("https://example.invalid/noncompliant-body", {
      timeoutMs: 15,
      responseType: "json",
    }),
    RequestTimeoutError,
  );
});

test("HTTP and parse errors do not expose URL query data", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    new Response('{"error":"denied"}', {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  await assert.rejects(
    customFetch("https://example.invalid/private?token=do-not-log", {
      responseType: "json",
    }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.url, "https://example.invalid/private");
      return true;
    },
  );

  globalThis.fetch = async () =>
    new Response("not-json", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  await assert.rejects(
    customFetch("https://example.invalid/private?token=do-not-log", {
      responseType: "json",
    }),
    (error) => {
      assert.ok(error instanceof ResponseParseError);
      assert.equal(error.url, "https://example.invalid/private");
      assert.equal(error.message.includes("do-not-log"), false);
      return true;
    },
  );
});

test("a Request signal is composed with the deadline signal", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const caller = new AbortController();
  let forwardedSignal;
  globalThis.fetch = (_input, init) => {
    forwardedSignal = init.signal;
    return new Promise((_resolve, reject) => {
      forwardedSignal.addEventListener(
        "abort",
        () => reject(forwardedSignal.reason),
        { once: true },
      );
    });
  };

  const pending = customFetch(
    new Request("https://example.invalid/composed", { signal: caller.signal }),
    { timeoutMs: 1_000 },
  );
  await Promise.resolve();
  caller.abort();
  await assert.rejects(pending, (error) => {
    assert.equal(error.name, "AbortError");
    return true;
  });
  assert.notEqual(forwardedSignal, caller.signal);
  assert.equal(forwardedSignal.aborted, true);
});

test("profile context is captured before asynchronous token acquisition", async (t) => {
  const originalFetch = globalThis.fetch;
  let releaseToken;
  let observedProfile;
  t.after(() => {
    setAuthTokenGetter(null);
    setCharacterProfileIdGetter(null);
    globalThis.fetch = originalFetch;
  });
  setAuthTokenGetter(
    () =>
      new Promise((resolve) => {
        releaseToken = resolve;
      }),
  );
  setCharacterProfileIdGetter(() => "profile-a");
  globalThis.fetch = async (_input, init) => {
    observedProfile = new Headers(init.headers).get("x-character-profile-id");
    return new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const pending = customFetch("https://example.invalid/profile-snapshot", {
    responseType: "json",
  });
  await Promise.resolve();
  setCharacterProfileIdGetter(() => "profile-b");
  releaseToken("token-a");
  await assert.rejects(pending, StaleRequestContextError);
  assert.equal(observedProfile, "profile-a");
});

test("an old session response is rejected after the auth context changes", async (t) => {
  const originalFetch = globalThis.fetch;
  let releaseResponse;
  let markFetchStarted;
  const fetchStarted = new Promise((resolve) => {
    markFetchStarted = resolve;
  });
  t.after(() => {
    setAuthTokenGetter(null);
    setCharacterProfileIdGetter(null);
    globalThis.fetch = originalFetch;
  });
  setAuthTokenGetter(() => "token-a");
  globalThis.fetch = () =>
    new Promise((resolve) => {
      releaseResponse = resolve;
      markFetchStarted();
    });

  const pending = customFetch("https://example.invalid/session-fence", {
    responseType: "json",
  });
  await fetchStarted;
  setAuthTokenGetter(() => "token-b");
  releaseResponse(
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  await assert.rejects(pending, StaleRequestContextError);
});
