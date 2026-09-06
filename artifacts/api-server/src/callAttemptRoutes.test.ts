import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://anotherme:test@127.0.0.1:5432/anotherme";
process.env.LIVEKIT_URL = "wss://livekit.example.invalid";
process.env.LIVEKIT_API_KEY = "test-api-key";
process.env.LIVEKIT_API_SECRET = "test-api-secret";
process.env.CALL_ATTEMPT_HEADER_ENFORCE_AFTER = "2026-09-01T00:00:00Z";

const ids = {
  call: "10000000-0000-4000-8000-000000000001",
  caller: "10000000-0000-4000-8000-000000000002",
  callee: "10000000-0000-4000-8000-000000000003",
  storedAttempt: "10000000-0000-4000-8000-000000000004",
  staleAttempt: "10000000-0000-4000-8000-000000000005",
};

const testState = vi.hoisted(() => ({
  selectedCall: undefined as Record<string, unknown> | undefined,
}));

const where = vi.hoisted(() => vi.fn(async () => (
  testState.selectedCall ? [testState.selectedCall] : []
)));
const from = vi.hoisted(() => vi.fn(() => ({ where })));
const select = vi.hoisted(() => vi.fn(() => ({ from })));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return { ...actual, db: { select } };
});

vi.mock("./lib/auth", () => ({
  requireAuth(req: Request, _res: Response, next: NextFunction) {
    req.dbUser = {
      id: ids.callee,
      nickname: "callee",
    } as NonNullable<Request["dbUser"]>;
    next();
  },
}));

vi.mock("./lib/rateLimit", () => ({
  rateLimit: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("./lib/push", () => ({
  incomingCallData: vi.fn(),
  sendCallPush: vi.fn(),
  sendCallTerminalPush: vi.fn(),
}));

vi.mock("./lib/realtime", () => ({ publishRealtimeEvent: vi.fn() }));
vi.mock("./lib/readReceipts", () => ({
  allocateRoomMessageSeq: vi.fn(),
  setMemberReadSeq: vi.fn(),
}));
vi.mock("./lib/characterProfiles", () => ({
  ensureCharacterProfileState: vi.fn(),
  resolveCharacterProfileActor: vi.fn(),
}));

const { default: express } = await import("express");
const { default: request } = await import("supertest");
const { default: callsRouter } = await import("./routes/calls");

const app = express();
app.use(express.json());
app.use(callsRouter);

describe("call attempt route fencing", () => {
  beforeEach(() => {
    select.mockClear();
    from.mockClear();
    where.mockClear();
    testState.selectedCall = {
      id: ids.call,
      callerId: ids.caller,
      calleeId: ids.callee,
      attemptId: ids.storedAttempt,
      status: "ringing",
      createdAt: new Date("2026-09-02T00:00:00Z"),
    };
  });

  it.each(["accept", "join"])(
    "rejects a stale attempt before mutating the call on /%s",
    async (action) => {
      const response = await request(app)
        .post(`/calls/${ids.call}/${action}`)
        .set("X-Call-Attempt-Id", ids.staleAttempt);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: "Call attempt identifier does not match this call",
      });
      expect(select).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["accept", "join"])(
    "rejects a missing attempt header for a post-cutoff call on /%s",
    async (action) => {
      const response = await request(app).post(`/calls/${ids.call}/${action}`);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: "Call attempt identifier does not match this call",
      });
      expect(select).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects creation without an attempt ID after enforcement begins", async () => {
    const response = await request(app)
      .post("/calls")
      .send({ calleeId: ids.caller, media: "audio" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "Call attempt identifier is required" });
    expect(select).not.toHaveBeenCalled();
  });

  it("rejects queued diagnostics from a different call generation", async () => {
    const response = await request(app)
      .post("/calls/diagnostics")
      .send({
        eventId: "10000000-0000-4000-8000-000000000006",
        attemptId: ids.staleAttempt,
        callId: ids.call,
        phase: "livekit_disconnected",
        platform: "ios",
        occurredAt: "2026-09-02T00:00:00.000Z",
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/attempt identifier/);
  });

  it("rejects legacy per-call diagnostics from a different generation", async () => {
    const response = await request(app)
      .post(`/calls/${ids.call}/diagnostics`)
      .set("X-Call-Attempt-Id", ids.staleAttempt)
      .send({ phase: "livekit_disconnected", platform: "ios" });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/attempt identifier/);
  });
});
