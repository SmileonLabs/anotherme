import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  DEFAULT_PERSONA_STATS,
  clanMembersTable,
  clansTable,
  personasTable,
  usersTable,
  type Clan,
  type ClanRole,
  type PersonaStats,
} from "@workspace/db";
import { computeLevel } from "./growth";
import { computeIdentity } from "./personaIdentity";

export const CLAN_LIST_LIMIT_DEFAULT = 30;
export const CLAN_LIST_LIMIT_MAX = 100;

export const CLAN_NAME_MIN = 2;
export const CLAN_NAME_MAX = 20;
export const CLAN_DESCRIPTION_MAX = 300;
export const CLAN_VALUES_MAX = 200;

/** Archetype keys a clan may prefer (must match persona archetype keys). */
export const CLAN_ARCHETYPE_KEYS = [
  "strategist",
  "harmonizer",
  "explorer",
  "pioneer",
  "sage",
  "entertainer",
  "activist",
  "observer",
] as const;
export type ClanArchetypeKey = (typeof CLAN_ARCHETYPE_KEYS)[number];

/** A clan member enriched with non-sensitive persona identity for display. */
export interface ClanMemberView {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  title: string;
  archetype: string;
  archetypeLabel: string;
  role: ClanRole;
  contributionExp: number;
}

export interface ClanView {
  id: string;
  name: string;
  description: string | null;
  emblemUrl: string | null;
  level: number;
  exp: number;
  memberCount: number;
  clanValues: string | null;
  clanSummary: string | null;
  preferredArchetype: string | null;
  createdAt: string;
}

export interface ClanSummaryView {
  id: string;
  name: string;
  description: string | null;
  emblemUrl: string | null;
  level: number;
  memberCount: number;
  preferredArchetype: string | null;
}

export interface MyClanView {
  clan: ClanView;
  myRole: ClanRole;
  memberCount: number;
  recentMembers: ClanMemberView[];
}

export interface ClanDetailView extends ClanView {
  members: ClanMemberView[];
}

/** Domain error so routes can map to a status + Korean message. */
export class ClanError extends Error {
  constructor(
    public code:
      | "already_in_clan"
      | "not_found"
      | "name_taken"
      | "not_member"
      | "owner_must_transfer"
      | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "ClanError";
  }
}

function serializeClan(c: Clan): ClanView {
  return {
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    emblemUrl: c.emblemUrl ?? null,
    level: c.level,
    exp: c.exp,
    memberCount: c.memberCount,
    clanValues: c.clanValues ?? null,
    clanSummary: c.clanSummary ?? null,
    preferredArchetype: c.preferredArchetype ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

function summarizeClan(c: Clan): ClanSummaryView {
  return {
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    emblemUrl: c.emblemUrl ?? null,
    level: c.level,
    memberCount: c.memberCount,
    preferredArchetype: c.preferredArchetype ?? null,
  };
}

/**
 * Enrich a clan's members with their (derived) persona identity. Read-only — it
 * only reads personas/users and computes level/archetype in-process (no AI, no
 * mutation). Exposes ONLY non-sensitive fields; email and any AI/chat/battle
 * content are never selected. Owner first, then by contribution desc, joined asc.
 */
async function loadMembers(clanId: string, limit?: number): Promise<ClanMemberView[]> {
  const rows = await db
    .select({
      userId: clanMembersTable.userId,
      role: clanMembersTable.role,
      contributionExp: clanMembersTable.contributionExp,
      joinedAt: clanMembersTable.joinedAt,
      nickname: usersTable.nickname,
      avatarUrl: usersTable.profileImageUrl,
      xp: personasTable.xp,
      stats: personasTable.stats,
    })
    .from(clanMembersTable)
    .innerJoin(usersTable, eq(clanMembersTable.userId, usersTable.id))
    .leftJoin(personasTable, eq(personasTable.userId, clanMembersTable.userId))
    .where(eq(clanMembersTable.clanId, clanId))
    .orderBy(
      sql`CASE ${clanMembersTable.role} WHEN 'owner' THEN 0 WHEN 'elder' THEN 1 ELSE 2 END`,
      desc(clanMembersTable.contributionExp),
      asc(clanMembersTable.joinedAt),
    );

  const sliced = typeof limit === "number" ? rows.slice(0, limit) : rows;

  return sliced.map((r) => {
    const stats: PersonaStats = { ...DEFAULT_PERSONA_STATS, ...(r.stats ?? {}) };
    const level = computeLevel(r.xp ?? 0);
    const identity = computeIdentity(stats);
    return {
      userId: r.userId,
      displayName: `${r.nickname?.trim() || "나"}의 어나더 미`,
      avatarUrl: r.avatarUrl ?? null,
      level,
      title: identity.title,
      archetype: identity.archetypeKey,
      archetypeLabel: identity.archetype,
      role: r.role as ClanRole,
      contributionExp: r.contributionExp,
    };
  });
}

/** The active clan membership for a user, or null. */
export async function getMembership(userId: string) {
  const [m] = await db
    .select()
    .from(clanMembersTable)
    .where(eq(clanMembersTable.userId, userId));
  return m ?? null;
}

/** My clan view (clan + role + recent members), or null when I have no clan. */
export async function getMyClan(userId: string): Promise<MyClanView | null> {
  const membership = await getMembership(userId);
  if (!membership) return null;

  const [clan] = await db
    .select()
    .from(clansTable)
    .where(eq(clansTable.id, membership.clanId));
  if (!clan) return null;

  const recentMembers = await loadMembers(clan.id, 8);
  return {
    clan: serializeClan(clan),
    myRole: membership.role as ClanRole,
    memberCount: clan.memberCount,
    recentMembers,
  };
}

/** Search/browse clans by name/description, optionally filtered by archetype. */
export async function listClans(opts: {
  q?: string | null;
  archetype?: ClanArchetypeKey | null;
  limit: number;
}): Promise<ClanSummaryView[]> {
  const limit = Math.min(CLAN_LIST_LIMIT_MAX, Math.max(1, opts.limit));
  const conds = [];
  if (opts.q && opts.q.trim()) {
    const pat = `%${opts.q.trim()}%`;
    conds.push(or(ilike(clansTable.name, pat), ilike(clansTable.description, pat)));
  }
  if (opts.archetype) {
    conds.push(eq(clansTable.preferredArchetype, opts.archetype));
  }

  const rows = await db
    .select()
    .from(clansTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(clansTable.memberCount), desc(clansTable.level), desc(clansTable.createdAt))
    .limit(limit);

  return rows.map(summarizeClan);
}

/** Full clan detail with the member list, or null if not found. */
export async function getClanDetail(clanId: string): Promise<ClanDetailView | null> {
  const [clan] = await db.select().from(clansTable).where(eq(clansTable.id, clanId));
  if (!clan) return null;
  const members = await loadMembers(clan.id);
  return { ...serializeClan(clan), members };
}

/**
 * Create a clan and add the creator as owner, atomically. Fails if the user is
 * already in a clan or the name is taken. member_count starts at 1, level 1,
 * exp 0. clan_summary is seeded from the description.
 */
export async function createClan(params: {
  userId: string;
  name: string;
  description?: string | null;
  clanValues?: string | null;
  preferredArchetype?: ClanArchetypeKey | null;
  emblemUrl?: string | null;
}): Promise<MyClanView> {
  const name = params.name.trim();
  if (name.length < CLAN_NAME_MIN || name.length > CLAN_NAME_MAX) {
    throw new ClanError("invalid", "가문 이름은 2~20자로 입력해 주세요.");
  }
  const description = params.description?.trim() || null;
  if (description && description.length > CLAN_DESCRIPTION_MAX) {
    throw new ClanError("invalid", "가문 설명이 너무 길어요.");
  }
  const clanValues = params.clanValues?.trim() || null;
  if (clanValues && clanValues.length > CLAN_VALUES_MAX) {
    throw new ClanError("invalid", "대표 가치관이 너무 길어요.");
  }

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: clanMembersTable.id })
      .from(clanMembersTable)
      .where(eq(clanMembersTable.userId, params.userId));
    if (existing.length > 0) {
      throw new ClanError("already_in_clan", "이미 가문에 소속되어 있어요.");
    }

    const [dup] = await tx
      .select({ id: clansTable.id })
      .from(clansTable)
      .where(eq(clansTable.name, name));
    if (dup) {
      throw new ClanError("name_taken", "이미 사용 중인 가문 이름이에요.");
    }

    const [clan] = await tx
      .insert(clansTable)
      .values({
        name,
        description,
        clanValues,
        clanSummary: description,
        preferredArchetype: params.preferredArchetype ?? null,
        emblemUrl: params.emblemUrl ?? null,
        ownerUserId: params.userId,
        level: 1,
        exp: 0,
        memberCount: 1,
      })
      .returning();

    await tx.insert(clanMembersTable).values({
      clanId: clan.id,
      userId: params.userId,
      role: "owner",
      contributionExp: 0,
    });
  });

  const mine = await getMyClan(params.userId);
  if (!mine) throw new ClanError("invalid", "가문 생성에 실패했어요.");
  return mine;
}

/**
 * Join an existing clan immediately (no approval). Fails if the user is already
 * in a clan or the clan does not exist. Increments member_count atomically.
 */
export async function joinClan(params: {
  userId: string;
  clanId: string;
}): Promise<MyClanView> {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: clanMembersTable.id })
      .from(clanMembersTable)
      .where(eq(clanMembersTable.userId, params.userId));
    if (existing.length > 0) {
      throw new ClanError("already_in_clan", "이미 가문에 소속되어 있어요.");
    }

    const [clan] = await tx
      .select({ id: clansTable.id })
      .from(clansTable)
      .where(eq(clansTable.id, params.clanId))
      .for("update");
    if (!clan) {
      throw new ClanError("not_found", "존재하지 않는 가문이에요.");
    }

    await tx.insert(clanMembersTable).values({
      clanId: params.clanId,
      userId: params.userId,
      role: "member",
      contributionExp: 0,
    });

    await tx
      .update(clansTable)
      .set({ memberCount: sql`${clansTable.memberCount} + 1` })
      .where(eq(clansTable.id, params.clanId));
  });

  const mine = await getMyClan(params.userId);
  if (!mine) throw new ClanError("invalid", "가문 가입에 실패했어요.");
  return mine;
}

/**
 * Leave the user's clan. A normal member/elder leaves and member_count drops by
 * one. The owner may leave only when they are the last member — that deletes the
 * clan (cascading the membership). With other members present the owner must
 * transfer ownership first (not implemented this phase).
 */
export async function leaveClan(params: {
  userId: string;
  clanId: string;
}): Promise<{ clanDeleted: boolean }> {
  return db.transaction(async (tx) => {
    const [membership] = await tx
      .select()
      .from(clanMembersTable)
      .where(eq(clanMembersTable.userId, params.userId));
    if (!membership || membership.clanId !== params.clanId) {
      throw new ClanError("not_member", "이 가문의 멤버가 아니에요.");
    }

    const [clan] = await tx
      .select()
      .from(clansTable)
      .where(eq(clansTable.id, params.clanId))
      .for("update");
    if (!clan) {
      throw new ClanError("not_found", "존재하지 않는 가문이에요.");
    }

    if (membership.role === "owner") {
      if (clan.memberCount > 1) {
        throw new ClanError(
          "owner_must_transfer",
          "가문장은 다른 멤버에게 권한을 넘긴 후 탈퇴할 수 있습니다.",
        );
      }
      // Last member who is the owner → delete the clan (cascades members).
      await tx.delete(clansTable).where(eq(clansTable.id, params.clanId));
      return { clanDeleted: true };
    }

    await tx.delete(clanMembersTable).where(eq(clanMembersTable.id, membership.id));
    await tx
      .update(clansTable)
      .set({ memberCount: sql`GREATEST(${clansTable.memberCount} - 1, 0)` })
      .where(eq(clansTable.id, params.clanId));
    return { clanDeleted: false };
  });
}
