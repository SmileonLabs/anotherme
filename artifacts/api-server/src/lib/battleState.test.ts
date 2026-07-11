import { describe, expect, it } from "vitest";
import type { BattleState } from "@workspace/db";
import { advanceTurn, computeRemaining, currentSpeakerIsAI, isExpired } from "./battleState";

function state(overrides: Partial<BattleState> = {}): BattleState {
  return {
    topic: "주제",
    category: "일반",
    startQuestion: "질문",
    phase: "active",
    participants: [
      { userId: "a", name: "A", side: "pro", totalScore: 10, ready: true },
      { userId: "b", name: "B", side: "con", totalScore: 5, ready: true, isAI: true },
    ],
    totalRounds: 3,
    timeLimitSeconds: 45,
    order: ["a", "b"],
    turnIndex: 0,
    currentSpeakerUserId: "a",
    turnStartedAt: "2026-01-01T00:00:00.000Z",
    ended: false,
    winnerUserId: null,
    ...overrides,
  };
}

describe("battle state", () => {
  it("computes remaining time and expiry from an injectable clock", () => {
    const active = state();
    expect(computeRemaining(active, Date.parse("2026-01-01T00:00:00.100Z"))).toBe(45);
    expect(computeRemaining(active, Date.parse("2026-01-01T00:00:46.000Z"))).toBe(0);
    expect(isExpired(active, Date.parse("2026-01-01T00:00:46.999Z"))).toBe(false);
    expect(isExpired(active, Date.parse("2026-01-01T00:00:47.000Z"))).toBe(true);
    expect(computeRemaining(state({ phase: "waiting", turnStartedAt: null }))).toBe(0);
  });

  it("advances the active speaker and ends with the scored winner", () => {
    const active = state({ turnIndex: 1 });
    expect(advanceTurn(active, Date.parse("2026-01-01T00:01:00.000Z"))).toEqual(["🔔 라운드 2 시작"]);
    expect(active).toMatchObject({ turnIndex: 2, currentSpeakerUserId: "a", turnStartedAt: "2026-01-01T00:01:00.000Z" });
    expect(currentSpeakerIsAI(state({ currentSpeakerUserId: "b" }))).toBe(true);

    const final = state({ turnIndex: 5 });
    expect(advanceTurn(final, Date.parse("2026-01-01T00:01:00.000Z"))).toEqual([
      "🏁 토론 종료! 승자는 A 님입니다. (A 10점 vs B 5점)",
    ]);
    expect(final).toMatchObject({ phase: "ended", ended: true, winnerUserId: "a", currentSpeakerUserId: null, turnStartedAt: null });
  });
});
