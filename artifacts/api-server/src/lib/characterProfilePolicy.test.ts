import { describe, expect, it } from "vitest";
import {
  FAN_EXPANSION_LEVEL,
  canArchiveCharacterProfile,
  canCreateAdditionalFan,
  normalizeProfileHandle,
} from "./characterProfilePolicy";

describe("character profile policy", () => {
  it("allows the first FAN but gates additional FAN profiles", () => {
    expect(canCreateAdditionalFan([])).toBe(true);
    expect(canCreateAdditionalFan([{ level: FAN_EXPANSION_LEVEL - 1, status: "active" }])).toBe(false);
    expect(canCreateAdditionalFan([{ level: FAN_EXPANSION_LEVEL, status: "active" }])).toBe(true);
    expect(canCreateAdditionalFan([{ level: 1, status: "torimia" }])).toBe(true);
  });

  it("keeps at least one character and normalizes public handles", () => {
    expect(canArchiveCharacterProfile(1)).toBe(false);
    expect(canArchiveCharacterProfile(2)).toBe(true);
    expect(normalizeProfileHandle(" My New FAN! ")).toBe("my-new-fan");
  });
});
