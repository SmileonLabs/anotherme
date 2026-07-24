import { describe, expect, it } from "vitest";

describe("mission definitions", () => {
  it("exposes only the requested daily missions plus the STAR-only mission", async () => {
    const { DAILY_QUESTS } = await import("./questDefinitions");
    expect(
      DAILY_QUESTS.map(({ key, title, target }) => ({ key, title, target })),
    ).toEqual([
      { key: "daily_talk", title: "채팅 참여", target: 1 },
      { key: "daily_like", title: "좋아요 미션", target: 1 },
      { key: "daily_attendance", title: "출석 미션", target: 1 },
      { key: "daily_dungeon", title: "STAR 미션", target: 3 },
    ]);
  });

  it("removes the weekly debate mission", async () => {
    const { WEEKLY_QUESTS } = await import("./questDefinitions");
    expect(WEEKLY_QUESTS.map((quest) => quest.key)).toEqual([
      "weekly_dungeon",
      "weekly_clan",
      "weekly_growth",
    ]);
  });
});
