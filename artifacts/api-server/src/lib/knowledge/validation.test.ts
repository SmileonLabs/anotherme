import { describe, expect, it } from "vitest";
import {
  confidenceValue,
  normalizeGoogleSearchItem,
  parsePositiveInt,
  validateImportUrl,
} from "./validation";

describe("knowledge validation", () => {
  it("keeps the existing permissive numeric bounds", () => {
    expect(parsePositiveInt("12.4", 5, 10)).toBe(10);
    expect(parsePositiveInt(0, 5, 10)).toBe(5);
    expect(confidenceValue(10)).toBe(35);
    expect(confidenceValue(120)).toBe(100);
  });

  it("accepts only http(s) import and Google result URLs", () => {
    expect(validateImportUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(validateImportUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeGoogleSearchItem({ title: "Example", link: "https://example.com" })?.title).toBe("Example");
    expect(normalizeGoogleSearchItem({ title: "Example", link: "javascript:alert(1)" })).toBeNull();
  });
});
