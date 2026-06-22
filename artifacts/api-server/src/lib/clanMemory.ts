import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  CLAN_MEMORY_SOURCE_TYPES,
  CLAN_MEMORY_TYPES,
  clanMembersTable,
  clanMemoriesTable,
  clansTable,
  usersTable,
  type ClanMemorySourceType,
  type ClanMemoryType,
  type ClanRole,
} from "@workspace/db";

export const CLAN_MEMORY_LIST_LIMIT_DEFAULT = 30;
export const CLAN_MEMORY_LIST_LIMIT_MAX = 100;

export const CLAN_MEMORY_TITLE_MAX = 80;
export const CLAN_MEMORY_SUMMARY_MAX = 1000;
export const CLAN_MEMORY_TAG_MAX = 20;
export const CLAN_MEMORY_TAGS_MAX = 5;

export { CLAN_MEMORY_TYPES, CLAN_MEMORY_SOURCE_TYPES };
export type { ClanMemoryType, ClanMemorySourceType };

/** Korean labels for each memory type (display only). */
export const CLAN_MEMORY_TYPE_LABELS: Record<ClanMemoryType, string> = {
  strategy: "전략",
  lesson: "교훈",
  value: "가치",
  achievement: "업적",
  warning: "경고",
};

/**
 * A clan memory, enriched with its (non-sensitive) author display name. Never
 * exposes email/clerkId or any chat/battle/dungeon/AI raw content — only the
 * user-authored fields and a free-text `sourceId` reference.
 */
export interface ClanMemoryView {
  id: string;
  clanId: string;
  sourceType: ClanMemorySourceType;
  sourceId: string | null;
  memoryType: ClanMemoryType;
  title: string;
  summary: string;
  importanceScore: number;
  tags: string[];
  createdByUserId: string | null;
  authorName: string | null;
  createdAt: string;
}

/** Domain error mapped to an HTTP status + Korean message by the route layer. */
export class ClanMemoryError extends Error {
  constructor(
    public code: "not_found" | "not_member" | "forbidden" | "invalid" | "duplicate",
    message: string,
  ) {
    super(message);
    this.name = "ClanMemoryError";
  }
}

interface MembershipInfo {
  role: ClanRole;
}

/** Resolve the caller's membership in a clan, or null if they are not a member. */
async function getMembershipIn(clanId: string, userId: string): Promise<MembershipInfo | null> {
  const [m] = await db
    .select({ role: clanMembersTable.role })
    .from(clanMembersTable)
    .where(and(eq(clanMembersTable.clanId, clanId), eq(clanMembersTable.userId, userId)));
  return m ? { role: m.role as ClanRole } : null;
}

async function clanExists(clanId: string): Promise<boolean> {
  const [c] = await db.select({ id: clansTable.id }).from(clansTable).where(eq(clansTable.id, clanId));
  return !!c;
}

/**
 * List a clan's memories (members only), newest first. `type` optionally filters
 * by memory type. Read-only: touches nothing but the clan-memory + users tables.
 */
export async function listClanMemories(opts: {
  clanId: string;
  meUserId: string;
  type?: ClanMemoryType | null;
  limit: number;
}): Promise<{ items: ClanMemoryView[] }> {
  const { clanId, meUserId, type } = opts;
  const limit = Math.min(CLAN_MEMORY_LIST_LIMIT_MAX, Math.max(1, opts.limit));

  if (!(await clanExists(clanId))) {
    throw new ClanMemoryError("not_found", "존재하지 않는 가문이에요.");
  }
  const membership = await getMembershipIn(clanId, meUserId);
  if (!membership) {
    throw new ClanMemoryError("not_member", "가문 멤버만 기억을 볼 수 있어요.");
  }

  const where = type
    ? and(eq(clanMemoriesTable.clanId, clanId), eq(clanMemoriesTable.memoryType, type))
    : eq(clanMemoriesTable.clanId, clanId);

  const rows = await db
    .select({
      id: clanMemoriesTable.id,
      clanId: clanMemoriesTable.clanId,
      sourceType: clanMemoriesTable.sourceType,
      sourceId: clanMemoriesTable.sourceId,
      memoryType: clanMemoriesTable.memoryType,
      title: clanMemoriesTable.title,
      summary: clanMemoriesTable.summary,
      importanceScore: clanMemoriesTable.importanceScore,
      tags: clanMemoriesTable.tags,
      createdByUserId: clanMemoriesTable.createdByUserId,
      authorName: usersTable.nickname,
      createdAt: clanMemoriesTable.createdAt,
    })
    .from(clanMemoriesTable)
    .leftJoin(usersTable, eq(usersTable.id, clanMemoriesTable.createdByUserId))
    .where(where)
    .orderBy(desc(clanMemoriesTable.createdAt))
    .limit(limit);

  return { items: rows.map(serializeMemory) };
}

function serializeMemory(r: {
  id: string;
  clanId: string;
  sourceType: string;
  sourceId: string | null;
  memoryType: string;
  title: string;
  summary: string;
  importanceScore: number;
  tags: string[];
  createdByUserId: string | null;
  authorName: string | null;
  createdAt: Date;
}): ClanMemoryView {
  return {
    id: r.id,
    clanId: r.clanId,
    sourceType: r.sourceType as ClanMemorySourceType,
    sourceId: r.sourceId ?? null,
    memoryType: r.memoryType as ClanMemoryType,
    title: r.title,
    summary: r.summary,
    importanceScore: r.importanceScore,
    tags: r.tags ?? [],
    createdByUserId: r.createdByUserId ?? null,
    authorName: r.authorName?.trim() || null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Normalize/validate user-supplied tags. Throws on too many; trims + dedupes. */
function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  const cleaned = tags
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => t.slice(0, CLAN_MEMORY_TAG_MAX));
  const unique = Array.from(new Set(cleaned));
  if (unique.length > CLAN_MEMORY_TAGS_MAX) {
    throw new ClanMemoryError("invalid", `태그는 최대 ${CLAN_MEMORY_TAGS_MAX}개까지 추가할 수 있어요.`);
  }
  return unique;
}

/**
 * Create a clan memory. Any clan member may create one. This NEVER stores raw
 * conversation content — callers pass a user-authored `summary` only. When
 * `sourceKey` is provided and already exists, the save is idempotent and the
 * existing memory is returned (so "save this battle" can't duplicate).
 */
export async function createClanMemory(opts: {
  clanId: string;
  meUserId: string;
  memoryType: ClanMemoryType;
  title: string;
  summary: string;
  tags?: string[];
  sourceType?: ClanMemorySourceType;
  sourceId?: string | null;
  sourceKey?: string | null;
  importanceScore?: number;
}): Promise<ClanMemoryView> {
  const { clanId, meUserId } = opts;

  if (!(await clanExists(clanId))) {
    throw new ClanMemoryError("not_found", "존재하지 않는 가문이에요.");
  }
  const membership = await getMembershipIn(clanId, meUserId);
  if (!membership) {
    throw new ClanMemoryError("not_member", "가문 멤버만 기억을 기록할 수 있어요.");
  }

  const title = opts.title?.trim() ?? "";
  const summary = opts.summary?.trim() ?? "";
  if (!title) throw new ClanMemoryError("invalid", "제목을 입력해 주세요.");
  if (!summary) throw new ClanMemoryError("invalid", "내용을 입력해 주세요.");
  if (title.length > CLAN_MEMORY_TITLE_MAX) {
    throw new ClanMemoryError("invalid", `제목은 ${CLAN_MEMORY_TITLE_MAX}자 이내로 입력해 주세요.`);
  }
  if (summary.length > CLAN_MEMORY_SUMMARY_MAX) {
    throw new ClanMemoryError("invalid", `내용은 ${CLAN_MEMORY_SUMMARY_MAX}자 이내로 입력해 주세요.`);
  }
  if (!CLAN_MEMORY_TYPES.includes(opts.memoryType)) {
    throw new ClanMemoryError("invalid", "잘못된 기억 유형이에요.");
  }
  const tags = normalizeTags(opts.tags);
  const sourceType = opts.sourceType ?? "manual";
  const sourceKey = opts.sourceKey?.trim() || null;

  // Idempotent save by natural key (e.g. battle/dungeon completion buttons).
  if (sourceKey) {
    const [existing] = await db
      .select()
      .from(clanMemoriesTable)
      .where(eq(clanMemoriesTable.sourceKey, sourceKey));
    if (existing) {
      if (existing.clanId !== clanId) {
        throw new ClanMemoryError("duplicate", "이미 다른 가문에 저장된 기억이에요.");
      }
      const [author] = existing.createdByUserId
        ? await db
            .select({ nickname: usersTable.nickname })
            .from(usersTable)
            .where(eq(usersTable.id, existing.createdByUserId))
        : [];
      return serializeMemory({ ...existing, authorName: author?.nickname ?? null });
    }
  }

  const [row] = await db
    .insert(clanMemoriesTable)
    .values({
      clanId,
      sourceType,
      sourceId: opts.sourceId ?? null,
      sourceKey,
      memoryType: opts.memoryType,
      title,
      summary,
      importanceScore: opts.importanceScore ?? 0,
      tags,
      createdByUserId: meUserId,
    })
    .returning();

  const [author] = await db
    .select({ nickname: usersTable.nickname })
    .from(usersTable)
    .where(eq(usersTable.id, meUserId));

  return serializeMemory({ ...row, authorName: author?.nickname ?? null });
}

/**
 * Delete a clan memory. Allowed for the original author, or any elder/owner of
 * the clan. Plain members cannot delete other people's memories.
 */
export async function deleteClanMemory(opts: {
  clanId: string;
  memoryId: string;
  meUserId: string;
}): Promise<{ deleted: true }> {
  const { clanId, memoryId, meUserId } = opts;

  const membership = await getMembershipIn(clanId, meUserId);
  if (!membership) {
    throw new ClanMemoryError("not_member", "가문 멤버만 기억을 삭제할 수 있어요.");
  }

  const [memory] = await db
    .select()
    .from(clanMemoriesTable)
    .where(and(eq(clanMemoriesTable.id, memoryId), eq(clanMemoriesTable.clanId, clanId)));
  if (!memory) {
    throw new ClanMemoryError("not_found", "존재하지 않는 기억이에요.");
  }

  const isAuthor = memory.createdByUserId === meUserId;
  const isElderOrOwner = membership.role === "owner" || membership.role === "elder";
  if (!isAuthor && !isElderOrOwner) {
    throw new ClanMemoryError("forbidden", "작성자 또는 원로·가문장만 삭제할 수 있어요.");
  }

  await db.delete(clanMemoriesTable).where(eq(clanMemoriesTable.id, memoryId));
  return { deleted: true };
}
