import { describe, expect, it } from "vitest";
import { getNftPublishReadiness, normalizeNftRpgMissions } from "./nftRpgContent";

describe("normalizeNftRpgMissions", () => {
  it("preserves analyzed mission objects instead of stringifying them", () => {
    const missions = normalizeNftRpgMissions({
      id: "collection-1",
      ipName: "GOAT PUNK",
      rpgBlueprint: {
        missions: [{ title: "네온 거리 정찰", description: "단서를 수집한다.", xp: 25 }],
      },
    } as never);
    expect(missions).toEqual([{
      id: "collection-1:mission:0",
      title: "네온 거리 정찰",
      description: "단서를 수집한다.",
      xp: 25,
    }]);
  });

  it("continues to support legacy string missions", () => {
    const [mission] = normalizeNftRpgMissions({
      id: "collection-1",
      ipName: "GOAT PUNK",
      rpgBlueprint: { missions: ["첫 임무"] },
    } as never);
    expect(mission?.title).toBe("첫 임무");
    expect(mission?.xp).toBe(10);
  });
});

describe("getNftPublishReadiness", () => {
  it("requires rights, analysis, blueprint and every published stage image", () => {
    const stageKeys = ["base", "growth_1", "awakening", "advanced", "signature", "ultimate"];
    const result = getNftPublishReadiness({
      rightsStatus: "verified",
      aiAnalyzedAt: new Date(),
      rpgBlueprint: { missions: [] },
    } as never, stageKeys.map((stageKey) => ({
      stageKey,
      status: "published",
      imageUrl: `/objects/${stageKey}.png`,
    })) as never);
    expect(result).toEqual({ ready: true, missing: [] });
  });
});
