import { createHash } from "node:crypto";

export const MAX_SOURCE_BODY = 60_000;
const MAX_EXTRACT_SENTENCES = 10;

export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function checksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function extractCandidateSentences(content: string): string[] {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  return Array.from(
    new Set(
      normalized
        .split(/(?<=[.!?。！？]|[다요죠음임])\s+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length >= 16),
    ),
  ).slice(0, MAX_EXTRACT_SENTENCES);
}
