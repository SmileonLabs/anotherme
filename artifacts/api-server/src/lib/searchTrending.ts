import { createHash } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, searchQueryLogsTable, searchTrendingBlocksTable } from "@workspace/db";
import { getRedis } from "./redis";

const CACHE_KEY = "search:trending:v1";
const CACHE_TTL_SECONDS = 300;
const TERM_MAX_LENGTH = 80;
const SENSITIVE_TERM = /(?:@|https?:\/\/|www\.|\b\d{6,}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i;

export type TrendingSearchItem = { term: string; rank: number; change: number; resultCount: number };

export function normalizeSearchTerm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (normalized.length < 2 || normalized.length > TERM_MAX_LENGTH || SENSITIVE_TERM.test(normalized)) return null;
  return normalized;
}

export function searchTermHash(term: string): string {
  return createHash("sha256").update(term).digest("hex");
}

export async function recordSearchQuery(args: { term: string; userId: string; resultCount: number }): Promise<void> {
  const term = normalizeSearchTerm(args.term);
  if (!term) return;
  await db.insert(searchQueryLogsTable).values({ normalizedTerm: term, termHash: searchTermHash(term), userId: args.userId, resultCount: Math.max(0, Math.min(args.resultCount, 10_000)) });
}

async function calculateTrending(limit: number): Promise<TrendingSearchItem[]> {
  const now = new Date();
  const currentStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const previousStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const [blocked, current, previous] = await Promise.all([
    db.select({ term: searchTrendingBlocksTable.normalizedTerm }).from(searchTrendingBlocksTable),
    db.select({ term: searchQueryLogsTable.normalizedTerm, count: sql<number>`count(*)` }).from(searchQueryLogsTable).where(gte(searchQueryLogsTable.createdAt, currentStart)).groupBy(searchQueryLogsTable.normalizedTerm),
    db.select({ term: searchQueryLogsTable.normalizedTerm, count: sql<number>`count(*)` }).from(searchQueryLogsTable).where(and(gte(searchQueryLogsTable.createdAt, previousStart), sql`${searchQueryLogsTable.createdAt} < ${currentStart}`)).groupBy(searchQueryLogsTable.normalizedTerm),
  ]);
  const blockedTerms = new Set(blocked.map((row) => row.term));
  const previousMap = new Map(previous.map((row) => [row.term, Number(row.count)]));
  return current
    .filter((row) => !blockedTerms.has(row.term))
    .map((row) => {
      const resultCount = Number(row.count);
      const previousCount = previousMap.get(row.term) ?? 0;
      return { term: row.term, rank: 0, change: resultCount - previousCount, resultCount };
    })
    .sort((a, b) => b.resultCount - a.resultCount || b.change - a.change || a.term.localeCompare(b.term))
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export async function getTrendingSearches(limit = 5): Promise<TrendingSearchItem[]> {
  const cappedLimit = Math.max(1, Math.min(limit, 10));
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return (JSON.parse(cached) as TrendingSearchItem[]).slice(0, cappedLimit);
    } catch { /* fall back to PostgreSQL */ }
  }
  const items = await calculateTrending(10);
  if (redis) {
    try { await redis.set(CACHE_KEY, JSON.stringify(items), "EX", CACHE_TTL_SECONDS); } catch { /* best effort cache */ }
  }
  return items.slice(0, cappedLimit);
}

export async function invalidateTrendingSearchCache(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try { await redis.del(CACHE_KEY); } catch { /* best effort cache */ }
}
