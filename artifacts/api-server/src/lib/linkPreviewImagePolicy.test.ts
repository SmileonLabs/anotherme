import { describe, expect, it } from "vitest";
import { safeLinkPreviewImageUrl } from "./linkPreviewImagePolicy";

describe("link preview image privacy policy", () => {
  it("fails closed for publisher-controlled and historical image URLs", () => {
    for (const candidate of [
      "https://tracker.example/pixel.gif?recipient=123",
      "http://93.184.216.34/thumbnail.jpg",
      "//cdn.example/preview.webp",
      "/api/link-preview-images/already-same-origin",
      "data:image/png;base64,AA==",
      null,
      undefined,
    ]) {
      expect(safeLinkPreviewImageUrl(candidate)).toBeNull();
    }
  });
});
