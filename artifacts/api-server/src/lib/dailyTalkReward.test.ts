import { describe, expect, it } from "vitest";

// The reward module imports the shared database package at module load, even
// though these policy functions do not access it.
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";

const { calculatePvtAmount, computeQualityScore } = await import("./dailyTalkReward");

const noAbuse = {
  messageCount: 10,
  userMessageCount: 5,
  otherMessageCount: 5,
  counterpartCount: 1,
  repeatedMessageRatio: 0,
  shortMessageRatio: 0,
  selfMessageRatio: 0.5,
  rewardMultiplier: 1,
  reductions: [],
};

describe("daily talk reward policy", () => {
  it("uses the documented weighted quality score", () => {
    expect(
      computeQualityScore({
        empathy: 80,
        communication: 60,
        trust: 70,
        positivity: 50,
        contribution: 90,
        spamRisk: 0,
      }),
    ).toBe(70);
  });

  it("applies quality tiers, spam reductions, and the reward cap", () => {
    const score = (qualityScore: number, spamRisk = 0) => ({
      empathy: qualityScore,
      communication: qualityScore,
      trust: qualityScore,
      positivity: qualityScore,
      contribution: qualityScore,
      qualityScore,
      spamRisk,
    });

    expect(calculatePvtAmount(score(39), noAbuse)).toBe(0);
    expect(calculatePvtAmount(score(40), noAbuse)).toBe(3);
    expect(calculatePvtAmount(score(50), noAbuse)).toBe(5);
    expect(calculatePvtAmount(score(70), noAbuse)).toBe(20);
    expect(calculatePvtAmount(score(90), noAbuse)).toBe(50);
    expect(calculatePvtAmount(score(90, 30), noAbuse)).toBe(25);
    expect(calculatePvtAmount(score(90, 60), noAbuse)).toBe(10);
    expect(calculatePvtAmount(score(90, 80), noAbuse)).toBe(0);
    expect(calculatePvtAmount(score(100), { ...noAbuse, rewardMultiplier: 0.5 })).toBe(25);
  });
});
