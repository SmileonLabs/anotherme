import { describe, expect, it } from "vitest";
import { checksum, extractCandidateSentences, stripHtml } from "./sourceText";

describe("knowledge source text", () => {
  it("strips executable markup before review extraction", () => {
    expect(stripHtml("<style>x</style><p>안녕하세요&nbsp;BIBI &amp; 음악</p><script>alert(1)</script>"))
      .toBe("안녕하세요 BIBI & 음악");
  });

  it("deduplicates eligible sentences and uses a stable checksum", () => {
    const sentence = "이 문장은 리뷰 후보로 충분히 긴 문장입니다.";
    expect(extractCandidateSentences(`${sentence} ${sentence}`)).toEqual([sentence]);
    expect(checksum("same")).toBe(checksum("same"));
  });
});
