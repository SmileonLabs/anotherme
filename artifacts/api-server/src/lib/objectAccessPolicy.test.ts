import { describe, expect, it } from "vitest";
import { hasReadableObjectReference } from "./objectAccessPolicy";

const path = "/objects/uploads/00000000-0000-4000-8000-000000000001";

describe("private object access policy", () => {
  it("allows an authenticated profile reference", () => {
    expect(hasReadableObjectReference(path, true, [])).toBe(true);
  });

  it("allows exact image and structured file references", () => {
    expect(hasReadableObjectReference(path, false, [{ type: "image", content: path }])).toBe(true);
    expect(hasReadableObjectReference(path, false, [{ type: "file", content: JSON.stringify({ path, name: "a.pdf" }) }])).toBe(true);
  });

  it("rejects substrings, malformed JSON, and unrelated references", () => {
    expect(hasReadableObjectReference(path, false, [{ type: "image", content: `${path}-other` }])).toBe(false);
    expect(hasReadableObjectReference(path, false, [{ type: "file", content: `{\"path\":` }])).toBe(false);
    expect(hasReadableObjectReference(path, false, [])).toBe(false);
  });
});
