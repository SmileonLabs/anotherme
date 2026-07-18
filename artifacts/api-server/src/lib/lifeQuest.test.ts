import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  LIFE_QUEST_THEMES: ["work", "relationship", "money", "health", "study", "conflict", "startup", "daily"],
}));

import { buildSystemPrompt } from "./lifeQuest";

describe("buildSystemPrompt", () => {
  it("uses the equipped NFT collection context instead of forcing an idol story", () => {
    const prompt = buildSystemPrompt("daily", {
      starName: "GOAT PUNK #56",
      ipName: "GOAT PUNK",
      category: "character",
      roleName: "거리의 새내기",
      worldStyle: "디스토피아 펑크 도시",
      missions: [{
        title: "네온 거리 정찰",
        description: "도시의 단서를 수집한다.",
        xp: 20,
      }],
    });
    expect(prompt).toContain("디스토피아 펑크 도시");
    expect(prompt).toContain("네온 거리 정찰");
    expect(prompt).toContain("아이돌로 고정하지 말고");
  });
});
