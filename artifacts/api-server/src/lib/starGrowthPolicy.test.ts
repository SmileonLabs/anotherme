import { describe, expect, it } from "vitest";
import { computeEvolutionStage, computeStarLevel } from "./starGrowthPolicy";

describe("STAR growth policy", () => {
  it("uses increasing cumulative XP thresholds", () => {
    expect(computeStarLevel(99)).toBe(1);
    expect(computeStarLevel(100)).toBe(2);
    expect(computeStarLevel(299)).toBe(2);
    expect(computeStarLevel(300)).toBe(3);
  });

  it("maps level thresholds to the six managed avatar stages", () => {
    expect([
      computeEvolutionStage(1),
      computeEvolutionStage(5),
      computeEvolutionStage(10),
      computeEvolutionStage(20),
      computeEvolutionStage(30),
      computeEvolutionStage(50),
    ]).toEqual(["base", "growth_1", "awakening", "advanced", "signature", "ultimate"]);
  });
});
