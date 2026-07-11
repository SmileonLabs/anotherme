import { describe, expect, it } from "vitest";
import { normalizePvtGrantAmount } from "./pvtPolicy";

describe("PVT grant policy", () => {
  it("truncates fractional grants without rounding up", () => {
    expect(normalizePvtGrantAmount(12.9)).toBe(12);
    expect(normalizePvtGrantAmount(0.9)).toBe(0);
  });

  it("rejects negative and non-finite grants", () => {
    expect(() => normalizePvtGrantAmount(-1)).toThrow("negative PVT grants");
    expect(() => normalizePvtGrantAmount(Number.NaN)).toThrow("must be finite");
    expect(() => normalizePvtGrantAmount(Number.POSITIVE_INFINITY)).toThrow("must be finite");
  });
});
