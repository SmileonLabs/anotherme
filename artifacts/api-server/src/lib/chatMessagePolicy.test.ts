import { describe, expect, it } from "vitest";
import {
  hasMatchingMessagePayload,
  parseMessagePage,
  validateUserMessage,
} from "./chatMessagePolicy";

describe("chat message policy", () => {
  it("accepts only bounded user-authored message shapes", () => {
    expect(validateUserMessage({ content: "  hello  ", clientMessageId: "m-1" })).toEqual({
      ok: true,
      value: {
        content: "hello",
        type: "text",
        replyToMessageId: null,
        metadata: null,
        clientMessageId: "m-1",
      },
    });
    expect(validateUserMessage({ content: "x", type: "system" })).toMatchObject({ ok: false });
    expect(validateUserMessage({ content: "/objects/../../secrets", type: "image" })).toMatchObject({ ok: false });
    expect(validateUserMessage({ content: "1f600_zz", type: "sticker" })).toMatchObject({ ok: false });
    expect(validateUserMessage({ content: "a".repeat(4_001) })).toMatchObject({ ok: false });
  });

  it("validates file claims and bounded metadata", () => {
    const file = JSON.stringify({
      path: "/objects/uploads/123e4567-e89b-12d3-a456-426614174000",
      name: "notes.pdf",
      size: 1024,
      mime: "application/pdf",
    });
    expect(validateUserMessage({ content: file, type: "file", metadata: { source: "share" } })).toMatchObject({ ok: true });
    expect(validateUserMessage({ content: JSON.stringify({ path: "/objects/x", name: "x", size: 26 * 1024 * 1024 }), type: "file" })).toMatchObject({ ok: false });
    expect(validateUserMessage({ content: "hello", metadata: { nested: { a: { b: { c: { d: true } } } } } })).toMatchObject({ ok: false });
  });

  it("uses a bounded positive roomSeq cursor", () => {
    expect(parseMessagePage({})).toEqual({ ok: true, limit: 50, beforeSeq: null });
    expect(parseMessagePage({ beforeSeq: "45", limit: "25" })).toEqual({ ok: true, limit: 25, beforeSeq: 45 });
    expect(parseMessagePage({ beforeSeq: "0" })).toMatchObject({ ok: false });
    expect(parseMessagePage({ limit: "101" })).toMatchObject({ ok: false });
  });

  it("does not let a reused client key represent a different payload", () => {
    const parsed = validateUserMessage({ content: "hello", metadata: { b: 2, a: 1 }, clientMessageId: "m-1" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(hasMatchingMessagePayload({
      content: "hello",
      type: "text",
      replyToMessageId: null,
      metadata: { a: 1, b: 2 },
    }, parsed.value)).toBe(true);
    expect(hasMatchingMessagePayload({
      content: "changed",
      type: "text",
      replyToMessageId: null,
      metadata: { a: 1, b: 2 },
    }, parsed.value)).toBe(false);
  });
});
