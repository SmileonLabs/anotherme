import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import {
  fetchPinnedPublicHtml,
  isSafePublicUrl,
  pinnedRequestOptions,
  type LinkPreviewPinnedResponse,
} from "./linkPreviewNetwork";

describe("link preview network boundary", () => {
  it("rejects literal loopback before an internal HTTP handler is touched", async () => {
    const server = createServer((_request, response) => {
      internalHits += 1;
      response.end("private");
    });
    let internalHits = 0;
    await listenOnLoopback(server);

    try {
      const port = (server.address() as AddressInfo).port;
      await expect(
        fetchPinnedPublicHtml(`http://127.0.0.1:${port}/metadata`),
      ).rejects.toThrow(/not public/i);
      expect(internalHits).toBe(0);
    } finally {
      await closeServer(server);
    }
  });

  it("validates every DNS answer and never invokes the request for a mixed private answer", async () => {
    const request = vi.fn();
    await expect(
      fetchPinnedPublicHtml("https://mixed.example/article", {
        resolve: async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ],
        request,
      }),
    ).rejects.toThrow(/non-public/i);
    expect(request).not.toHaveBeenCalled();
  });

  it("revalidates a redirect before it can touch an internal HTTP handler", async () => {
    const server = createServer((_request, response) => {
      internalHits += 1;
      response.end("secret");
    });
    let internalHits = 0;
    await listenOnLoopback(server);

    try {
      const port = (server.address() as AddressInfo).port;
      const request = vi.fn(async (target): Promise<LinkPreviewPinnedResponse> => {
        if (request.mock.calls.length === 1) {
          return {
            statusCode: 302,
            headers: { location: `http://127.0.0.1:${port}/secret` },
            body: "",
          };
        }

        // This path deliberately performs the dangerous request. A regression
        // that follows the redirect before validation will therefore increment
        // the real internal handler counter and fail the assertion below.
        const response = await fetch(target.url);
        return {
          statusCode: response.status,
          headers: { "content-type": response.headers.get("content-type") ?? "text/html" },
          body: await response.text(),
        };
      });

      await expect(
        fetchPinnedPublicHtml("https://public.example/start", {
          resolve: async () => [{ address: "93.184.216.34", family: 4 }],
          request,
        }),
      ).rejects.toThrow(/not public/i);
      expect(request).toHaveBeenCalledTimes(1);
      expect(internalHits).toBe(0);
    } finally {
      await closeServer(server);
    }
  });

  it("passes only the verified address to the transport and preserves the origin Host/SNI", async () => {
    const request = vi.fn(async (target): Promise<LinkPreviewPinnedResponse> => ({
      statusCode: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: "<html><title>Safe preview</title></html>",
    }));

    const result = await fetchPinnedPublicHtml("https://safe.example/story?q=1#private-fragment", {
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      request,
    });

    expect(result.finalUrl).toBe("https://safe.example/story?q=1");
    expect(request).toHaveBeenCalledTimes(1);
    const target = request.mock.calls[0]?.[0];
    expect(target?.address).toBe("93.184.216.34");
    expect(target?.url.hostname).toBe("safe.example");

    const options = pinnedRequestOptions(target!);
    expect(options.hostname).toBe("93.184.216.34");
    expect(options.servername).toBe("safe.example");
    expect(options.headers).toMatchObject({ Host: "safe.example" });
    expect(options.agent).toBe(false);
  });

  it("rejects alternate loopback and private IP encodings", () => {
    for (const rawUrl of [
      "http://2130706433/",
      "http://0177.0.0.1/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[fc00::1]/",
      "http://[fe80::1]/",
    ]) {
      expect(isSafePublicUrl(new URL(rawUrl)), rawUrl).toBe(false);
    }
  });
});

function listenOnLoopback(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
