import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "./rateLimit";

function response() {
  const headers = new Map<string, string>();
  const res = {
    set: vi.fn((name: string, value: string) => { headers.set(name, value); return res; }),
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  } as unknown as Response;
  return { res, headers };
}

describe("rateLimit local fallback", () => {
  it("allows requests up to the limit and returns 429 afterwards", async () => {
    const middleware = rateLimit({ name: `test-${Date.now()}`, limit: 2, windowSeconds: 60 });
    const req = { ip: "127.0.0.1" } as Request;
    const next = vi.fn() as NextFunction;

    await middleware(req, response().res, next);
    await middleware(req, response().res, next);
    const blocked = response();
    await middleware(req, blocked.res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(blocked.res.status).toHaveBeenCalledWith(429);
    expect(blocked.headers.get("Retry-After")).toBeDefined();
  });
});
