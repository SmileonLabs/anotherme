import { describe, expect, it } from "vitest";
import {
  battleLevelInfo,
  MAX_UTTERANCE_CHARS,
  roundOf,
  TOTAL_ROUNDS,
  TURN_SECONDS,
} from "./battleRules";

describe("battle rules", () => {
  it("maps turn indexes and preserves battle limits", () => {
    expect([0, 1, 2, 5].map(roundOf)).toEqual([1, 1, 2, 3]);
    expect({ TOTAL_ROUNDS, TURN_SECONDS, MAX_UTTERANCE_CHARS }).toEqual({
      TOTAL_ROUNDS: 3,
      TURN_SECONDS: 45,
      MAX_UTTERANCE_CHARS: 1000,
    });
  });

  it("derives deterministic levels and caps titles at the final rank", () => {
    expect(battleLevelInfo(-1)).toMatchObject({ level: 1, mpIntoLevel: 0, mpToNext: 500 });
    expect(battleLevelInfo(499)).toMatchObject({ level: 1, mpIntoLevel: 499, mpToNext: 1 });
    expect(battleLevelInfo(500.9)).toMatchObject({ level: 2, mpIntoLevel: 0 });
    expect(battleLevelInfo(5000).title).toBe("솔로몬의 후예");
  });
});
