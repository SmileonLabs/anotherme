import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  clanMembersTable,
  clansTable,
  clanWarParticipantsTable,
  clanWarResultsTable,
  clanWarsTable,
  usersTable,
  type ClanRole,
  type ClanWarSide,
  type ClanWarStatus,
} from "@workspace/db";
import type { Logger } from "pino";
import { getOpenAI } from "./aiClient";
import { computeClanLevel } from "./clanGrowth";

const WAR_MODEL = "gpt-5-mini";

export const WAR_TOPIC_MIN = 2;
export const WAR_TOPIC_MAX = 120;
export const WAR_SUBMISSION_MIN = 5;
export const WAR_SUBMISSION_MAX = 1000;

/** Max submissions per side fed to the judge (prompt bound). */
const WAR_JUDGE_SUBMISSION_CAP = 20;
/** How many top participant scores average into a clan's score. */
const CLAN_SCORE_TOP_N = 3;
/**
 * How long a war may stay in the transient "completing" claim before another
 * /complete call is allowed to take it over. Guards against a permanent lock if
 * the process crashes between claiming the war and finalizing it.
 */
const WAR_COMPLETING_STALE_MS = 2 * 60 * 1000;

/** Isolated clan-war rewards (kept separate from the existing clan-EXP logic). */
export const WAR_WINNER_CLAN_EXP = 100;
export const WAR_LOSER_CLAN_EXP = 30;
export const WAR_PARTICIPANT_CONTRIBUTION = 10;

/** Map a DB error to an HTTP status + Korean message in the route layer. */
export class ClanWarError extends Error {
  constructor(
    public code:
      | "not_found"
      | "not_member"
      | "forbidden"
      | "invalid"
      | "conflict"
      | "no_clan"
      | "ai_failed",
    message: string,
  ) {
    super(message);
    this.name = "ClanWarError";
  }
}

// ---------------------------------------------------------------------------
// Shared read helpers
// ---------------------------------------------------------------------------

interface Membership {
  clanId: string;
  membershipId: string;
  role: ClanRole;
}

async function getMembership(userId: string): Promise<Membership | null> {
  const [m] = await db
    .select({
      clanId: clanMembersTable.clanId,
      membershipId: clanMembersTable.id,
      role: clanMembersTable.role,
    })
    .from(clanMembersTable)
    .where(eq(clanMembersTable.userId, userId));
  return m ? { clanId: m.clanId, membershipId: m.membershipId, role: m.role as ClanRole } : null;
}

function isOwnerOrElder(role: ClanRole): boolean {
  return role === "owner" || role === "elder";
}

async function getClanNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: clansTable.id, name: clansTable.name })
    .from(clansTable)
    .where(inArray(clansTable.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export interface ClanWarSummary {
  id: string;
  topic: string;
  status: ClanWarStatus;
  challengerClanId: string;
  challengerClanName: string | null;
  opponentClanId: string | null;
  opponentClanName: string | null;
  winnerClanId: string | null;
  challengerScore: number;
  opponentScore: number;
  participantCount: number;
  createdAt: string;
}

export interface ClanWarParticipantView {
  userId: string;
  displayName: string | null;
  side: ClanWarSide;
  hasSubmitted: boolean;
  score: number;
  contributionSummary: string | null;
}

export interface ClanWarResultView {
  judgeSummary: string;
  challengerFeedback: string;
  opponentFeedback: string;
}

export interface ClanWarDetail extends ClanWarSummary {
  participants: ClanWarParticipantView[];
  /** The caller's own submission text (only ever their own — never others'). */
  mySubmission: string | null;
  mySide: ClanWarSide | null;
  myHasJoined: boolean;
  result: ClanWarResultView | null;
}

function serializeSummary(
  w: typeof clanWarsTable.$inferSelect,
  participantCount: number,
  names: Map<string, string>,
): ClanWarSummary {
  return {
    id: w.id,
    topic: w.topic,
    status: w.status as ClanWarStatus,
    challengerClanId: w.challengerClanId,
    challengerClanName: names.get(w.challengerClanId) ?? null,
    opponentClanId: w.opponentClanId ?? null,
    opponentClanName: w.opponentClanId ? (names.get(w.opponentClanId) ?? null) : null,
    winnerClanId: w.winnerClanId ?? null,
    challengerScore: w.challengerScore,
    opponentScore: w.opponentScore,
    participantCount,
    createdAt: w.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Create / list / detail
// ---------------------------------------------------------------------------

/** Create a clan war. The creator's clan is the challenger; owner/elder only. */
export async function createClanWar(opts: {
  meUserId: string;
  topic: string;
  opponentClanId?: string | null;
  log: Logger;
}): Promise<ClanWarDetail> {
  const topic = opts.topic.trim();
  if (topic.length < WAR_TOPIC_MIN || topic.length > WAR_TOPIC_MAX) {
    throw new ClanWarError("invalid", `주제는 ${WAR_TOPIC_MIN}~${WAR_TOPIC_MAX}자로 입력해 주세요.`);
  }

  const me = await getMembership(opts.meUserId);
  if (!me) throw new ClanWarError("no_clan", "가문에 속해 있어야 가문전을 만들 수 있어요.");
  if (!isOwnerOrElder(me.role)) {
    throw new ClanWarError("forbidden", "가문장 또는 원로만 가문전을 만들 수 있어요.");
  }

  let opponentClanId: string | null = null;
  let status: ClanWarStatus = "open";
  if (opts.opponentClanId) {
    if (opts.opponentClanId === me.clanId) {
      throw new ClanWarError("invalid", "같은 가문과는 가문전을 할 수 없어요.");
    }
    const [opp] = await db
      .select({ id: clansTable.id })
      .from(clansTable)
      .where(eq(clansTable.id, opts.opponentClanId));
    if (!opp) throw new ClanWarError("not_found", "상대 가문을 찾을 수 없어요.");
    opponentClanId = opp.id;
    status = "matched";
  }

  const [war] = await db
    .insert(clanWarsTable)
    .values({
      topic,
      status,
      challengerClanId: me.clanId,
      opponentClanId,
      createdByUserId: opts.meUserId,
      startsAt: status === "matched" ? new Date() : null,
    })
    .returning();

  opts.log.info({ warId: war.id, status }, "clan war created");
  return getClanWar({ warId: war.id, meUserId: opts.meUserId });
}

/** List wars relevant to the caller: open public challenges + their clan's wars. */
export async function listClanWars(opts: {
  meUserId: string;
  status?: ClanWarStatus;
}): Promise<ClanWarSummary[]> {
  const me = await getMembership(opts.meUserId);

  const visibility = me
    ? or(
        eq(clanWarsTable.status, "open"),
        eq(clanWarsTable.challengerClanId, me.clanId),
        eq(clanWarsTable.opponentClanId, me.clanId),
      )
    : eq(clanWarsTable.status, "open");

  const where = opts.status
    ? and(visibility, eq(clanWarsTable.status, opts.status))
    : visibility;

  const wars = await db
    .select()
    .from(clanWarsTable)
    .where(where)
    .orderBy(desc(clanWarsTable.createdAt))
    .limit(100);

  if (wars.length === 0) return [];

  const warIds = wars.map((w) => w.id);
  const counts = await db
    .select({ warId: clanWarParticipantsTable.warId, count: sql<number>`count(*)::int` })
    .from(clanWarParticipantsTable)
    .where(inArray(clanWarParticipantsTable.warId, warIds))
    .groupBy(clanWarParticipantsTable.warId);
  const countMap = new Map(counts.map((c) => [c.warId, c.count]));

  const names = await getClanNames(
    wars.flatMap((w) => [w.challengerClanId, w.opponentClanId].filter(Boolean) as string[]),
  );

  return wars.map((w) => serializeSummary(w, countMap.get(w.id) ?? 0, names));
}

async function loadWarOrThrow(warId: string): Promise<typeof clanWarsTable.$inferSelect> {
  const [war] = await db.select().from(clanWarsTable).where(eq(clanWarsTable.id, warId));
  if (!war) throw new ClanWarError("not_found", "가문전을 찾을 수 없어요.");
  return war;
}

function sideForClan(
  war: typeof clanWarsTable.$inferSelect,
  clanId: string,
): ClanWarSide | null {
  if (clanId === war.challengerClanId) return "challenger";
  if (war.opponentClanId && clanId === war.opponentClanId) return "opponent";
  return null;
}

/** Full war detail. Never exposes other members' raw submissions. */
export async function getClanWar(opts: {
  warId: string;
  meUserId: string;
}): Promise<ClanWarDetail> {
  const war = await loadWarOrThrow(opts.warId);
  const me = await getMembership(opts.meUserId);
  const mySide = me ? sideForClan(war, me.clanId) : null;

  // Open challenges are visible to everyone (so other clans can accept); any
  // other status is restricted to members of the two participating clans.
  if (war.status !== "open" && !mySide) {
    throw new ClanWarError("forbidden", "이 가문전을 볼 권한이 없어요.");
  }

  const participants = await db
    .select({
      userId: clanWarParticipantsTable.userId,
      displayName: usersTable.nickname,
      side: clanWarParticipantsTable.side,
      submission: clanWarParticipantsTable.submission,
      score: clanWarParticipantsTable.score,
      contributionSummary: clanWarParticipantsTable.contributionSummary,
    })
    .from(clanWarParticipantsTable)
    .leftJoin(usersTable, eq(usersTable.id, clanWarParticipantsTable.userId))
    .where(eq(clanWarParticipantsTable.warId, war.id))
    .orderBy(desc(clanWarParticipantsTable.score));

  const mine = participants.find((p) => p.userId === opts.meUserId);

  const [result] = await db
    .select({
      judgeSummary: clanWarResultsTable.judgeSummary,
      challengerFeedback: clanWarResultsTable.challengerFeedback,
      opponentFeedback: clanWarResultsTable.opponentFeedback,
    })
    .from(clanWarResultsTable)
    .where(eq(clanWarResultsTable.warId, war.id));

  const names = await getClanNames(
    [war.challengerClanId, war.opponentClanId].filter(Boolean) as string[],
  );

  return {
    ...serializeSummary(war, participants.length, names),
    participants: participants.map((p) => ({
      userId: p.userId,
      displayName: p.displayName?.trim() || null,
      side: p.side as ClanWarSide,
      hasSubmitted: !!p.submission,
      score: p.score,
      contributionSummary: p.contributionSummary,
    })),
    mySubmission: mine?.submission ?? null,
    mySide: mySide,
    myHasJoined: !!mine,
    result: result ?? null,
  };
}

// ---------------------------------------------------------------------------
// Accept / join / submit
// ---------------------------------------------------------------------------

/** Accept an open public challenge as the opponent (owner/elder of another clan). */
export async function acceptClanWar(opts: {
  warId: string;
  meUserId: string;
  log: Logger;
}): Promise<ClanWarDetail> {
  const me = await getMembership(opts.meUserId);
  if (!me) throw new ClanWarError("no_clan", "가문에 속해 있어야 도전을 수락할 수 있어요.");
  if (!isOwnerOrElder(me.role)) {
    throw new ClanWarError("forbidden", "가문장 또는 원로만 도전을 수락할 수 있어요.");
  }

  await db.transaction(async (tx) => {
    const [war] = await tx
      .select()
      .from(clanWarsTable)
      .where(eq(clanWarsTable.id, opts.warId))
      .for("update");
    if (!war) throw new ClanWarError("not_found", "가문전을 찾을 수 없어요.");
    if (war.status !== "open") {
      throw new ClanWarError("conflict", "이미 매칭되었거나 종료된 가문전이에요.");
    }
    if (war.challengerClanId === me.clanId) {
      throw new ClanWarError("invalid", "자신의 가문이 만든 도전은 수락할 수 없어요.");
    }
    await tx
      .update(clanWarsTable)
      .set({ opponentClanId: me.clanId, status: "matched", startsAt: new Date() })
      .where(eq(clanWarsTable.id, war.id));
  });

  opts.log.info({ warId: opts.warId, clanId: me.clanId }, "clan war accepted");
  return getClanWar({ warId: opts.warId, meUserId: opts.meUserId });
}

/** Join a matched/active war as a member of one of the two clans (idempotent). */
export async function joinClanWar(opts: {
  warId: string;
  meUserId: string;
}): Promise<ClanWarDetail> {
  const me = await getMembership(opts.meUserId);
  if (!me) throw new ClanWarError("no_clan", "가문에 속해 있어야 참여할 수 있어요.");

  const war = await loadWarOrThrow(opts.warId);
  if (war.status !== "matched" && war.status !== "active") {
    throw new ClanWarError("conflict", "지금은 참여할 수 없는 가문전이에요.");
  }
  const side = sideForClan(war, me.clanId);
  if (!side) throw new ClanWarError("not_member", "참여 중인 가문의 멤버만 참여할 수 있어요.");

  await db
    .insert(clanWarParticipantsTable)
    .values({ warId: war.id, clanId: me.clanId, userId: opts.meUserId, side })
    .onConflictDoNothing({
      target: [clanWarParticipantsTable.warId, clanWarParticipantsTable.userId],
    });

  return getClanWar({ warId: opts.warId, meUserId: opts.meUserId });
}

/** Submit (once) a member's argument. Auto-joins if not yet a participant. */
export async function submitClanWarArgument(opts: {
  warId: string;
  meUserId: string;
  content: string;
}): Promise<ClanWarDetail> {
  const content = opts.content.trim();
  if (content.length < WAR_SUBMISSION_MIN || content.length > WAR_SUBMISSION_MAX) {
    throw new ClanWarError(
      "invalid",
      `주장은 ${WAR_SUBMISSION_MIN}~${WAR_SUBMISSION_MAX}자로 입력해 주세요.`,
    );
  }

  const me = await getMembership(opts.meUserId);
  if (!me) throw new ClanWarError("no_clan", "가문에 속해 있어야 제출할 수 있어요.");

  await db.transaction(async (tx) => {
    const [war] = await tx
      .select()
      .from(clanWarsTable)
      .where(eq(clanWarsTable.id, opts.warId))
      .for("update");
    if (!war) throw new ClanWarError("not_found", "가문전을 찾을 수 없어요.");
    if (war.status !== "matched" && war.status !== "active") {
      throw new ClanWarError("conflict", "지금은 제출할 수 없는 가문전이에요.");
    }
    const side = sideForClan(war, me.clanId);
    if (!side) throw new ClanWarError("not_member", "참여 중인 가문의 멤버만 제출할 수 있어요.");

    const [existing] = await tx
      .select({ id: clanWarParticipantsTable.id, submission: clanWarParticipantsTable.submission })
      .from(clanWarParticipantsTable)
      .where(
        and(
          eq(clanWarParticipantsTable.warId, war.id),
          eq(clanWarParticipantsTable.userId, opts.meUserId),
        ),
      );

    if (existing?.submission) {
      throw new ClanWarError("conflict", "이미 주장을 제출했어요. 한 번만 제출할 수 있어요.");
    }

    if (existing) {
      await tx
        .update(clanWarParticipantsTable)
        .set({ submission: content, submittedAt: new Date() })
        .where(eq(clanWarParticipantsTable.id, existing.id));
    } else {
      await tx.insert(clanWarParticipantsTable).values({
        warId: war.id,
        clanId: me.clanId,
        userId: opts.meUserId,
        side,
        submission: content,
        submittedAt: new Date(),
      });
    }

    // Promote to "active" once both sides have at least one submission.
    if (war.status === "matched") {
      const sides = await tx
        .select({ side: clanWarParticipantsTable.side })
        .from(clanWarParticipantsTable)
        .where(
          and(
            eq(clanWarParticipantsTable.warId, war.id),
            sql`${clanWarParticipantsTable.submission} is not null`,
          ),
        );
      const set = new Set(sides.map((s) => s.side));
      // The current submission was inserted above; include the caller's side.
      set.add(side);
      if (set.has("challenger") && set.has("opponent")) {
        await tx
          .update(clanWarsTable)
          .set({ status: "active" })
          .where(eq(clanWarsTable.id, war.id));
      }
    }
  });

  return getClanWar({ warId: opts.warId, meUserId: opts.meUserId });
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

/** Cancel a war before completion (challenger's owner/elder only). */
export async function cancelClanWar(opts: {
  warId: string;
  meUserId: string;
}): Promise<ClanWarDetail> {
  const me = await getMembership(opts.meUserId);
  if (!me) throw new ClanWarError("no_clan", "가문에 속해 있어야 취소할 수 있어요.");

  await db.transaction(async (tx) => {
    const [war] = await tx
      .select()
      .from(clanWarsTable)
      .where(eq(clanWarsTable.id, opts.warId))
      .for("update");
    if (!war) throw new ClanWarError("not_found", "가문전을 찾을 수 없어요.");
    if (war.challengerClanId !== me.clanId || !isOwnerOrElder(me.role)) {
      throw new ClanWarError("forbidden", "도전을 만든 가문의 가문장·원로만 취소할 수 있어요.");
    }
    if (war.status === "completing") {
      throw new ClanWarError("conflict", "결과를 집계하는 중에는 취소할 수 없어요.");
    }
    if (war.status === "completed" || war.status === "cancelled") {
      throw new ClanWarError("conflict", "이미 종료된 가문전이에요.");
    }
    await tx
      .update(clanWarsTable)
      .set({ status: "cancelled", endsAt: new Date() })
      .where(eq(clanWarsTable.id, war.id));
  });

  return getClanWar({ warId: opts.warId, meUserId: opts.meUserId });
}

// ---------------------------------------------------------------------------
// Complete (AI judge once + scoring + isolated rewards)
// ---------------------------------------------------------------------------

function topNAverage(scores: number[], n: number): number {
  if (scores.length === 0) return 0;
  const top = [...scores].sort((a, b) => b - a).slice(0, n);
  return Math.round(top.reduce((a, b) => a + b, 0) / top.length);
}

/** Add EXP to a specific clan (isolated from the existing clan-EXP path). */
async function addClanExp(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  clanId: string,
  delta: number,
): Promise<void> {
  if (delta <= 0) return;
  const [clan] = await tx
    .select({ exp: clansTable.exp })
    .from(clansTable)
    .where(eq(clansTable.id, clanId))
    .for("update");
  if (!clan) return;
  const newExp = clan.exp + delta;
  await tx
    .update(clansTable)
    .set({ exp: newExp, level: computeClanLevel(newExp) })
    .where(eq(clansTable.id, clanId));
}

/**
 * Complete a war: judge all submissions with ONE AI call, derive clan scores
 * (top-3 average), record the winner + result, and apply small isolated rewards.
 * Owner/elder of either participating clan may trigger it. Idempotent: the reward
 * + result write happens under a row lock gated on `status != "completed"`.
 */
export async function completeClanWar(opts: {
  warId: string;
  meUserId: string;
  log: Logger;
}): Promise<ClanWarDetail> {
  const me = await getMembership(opts.meUserId);
  if (!me) throw new ClanWarError("no_clan", "가문에 속해 있어야 종료할 수 있어요.");

  // --- Phase A: authorize (no AI, no lock held). ---
  const war = await loadWarOrThrow(opts.warId);
  const mySide = sideForClan(war, me.clanId);
  if (!mySide || !isOwnerOrElder(me.role)) {
    throw new ClanWarError("forbidden", "참여 가문의 가문장·원로만 결과를 확정할 수 있어요.");
  }
  if (war.status === "completed") {
    return getClanWar({ warId: opts.warId, meUserId: opts.meUserId });
  }

  // --- Phase A2: atomically CLAIM completion under a row lock. Transitioning the
  // war to "completing" guarantees the AI judge runs exactly once (a second
  // concurrent /complete is rejected) and freezes the submission set (submit
  // requires matched/active), so the scored set can't change mid-judging. ---
  const claim = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({
        status: clanWarsTable.status,
        opponentClanId: clanWarsTable.opponentClanId,
        updatedAt: clanWarsTable.updatedAt,
      })
      .from(clanWarsTable)
      .where(eq(clanWarsTable.id, war.id))
      .for("update");
    if (!locked) throw new ClanWarError("not_found", "가문전을 찾을 수 없어요.");
    if (locked.status === "completed") return { alreadyDone: true as const };
    if (locked.status === "completing") {
      // Another /complete holds the claim. Only allow a takeover if it has been
      // stuck far longer than judging should take (e.g. the worker crashed) —
      // otherwise reject so the AI judge still runs exactly once.
      const heldMs = Date.now() - new Date(locked.updatedAt).getTime();
      if (heldMs < WAR_COMPLETING_STALE_MS) {
        throw new ClanWarError("conflict", "이미 결과를 집계하고 있어요. 잠시만 기다려 주세요.");
      }
      // Re-stamp the claim (bumps updatedAt) and take over. A stuck completing war
      // is rolled back to "active" on any later bail.
      await tx
        .update(clanWarsTable)
        .set({ status: "completing" })
        .where(eq(clanWarsTable.id, war.id));
      return { alreadyDone: false as const, prevStatus: "active" as ClanWarStatus };
    }
    if (locked.status !== "matched" && locked.status !== "active") {
      throw new ClanWarError("conflict", "지금은 결과를 확정할 수 없는 가문전이에요.");
    }
    if (!locked.opponentClanId) {
      throw new ClanWarError("conflict", "상대 가문이 정해진 뒤에 확정할 수 있어요.");
    }
    await tx
      .update(clanWarsTable)
      .set({ status: "completing" })
      .where(eq(clanWarsTable.id, war.id));
    return { alreadyDone: false as const, prevStatus: locked.status as ClanWarStatus };
  });

  if (claim.alreadyDone) {
    return getClanWar({ warId: opts.warId, meUserId: opts.meUserId });
  }
  const prevStatus = claim.prevStatus;

  // Roll the war back to its pre-claim status if we bail before persisting a
  // result (empty side, AI failure) — only if we still hold the "completing" claim.
  const restore = async () => {
    await db
      .update(clanWarsTable)
      .set({ status: prevStatus })
      .where(and(eq(clanWarsTable.id, war.id), eq(clanWarsTable.status, "completing")));
  };

  // --- Submissions are now frozen; load the exact set the judge will score. ---
  const submitted = await db
    .select({
      id: clanWarParticipantsTable.id,
      userId: clanWarParticipantsTable.userId,
      side: clanWarParticipantsTable.side,
      submission: clanWarParticipantsTable.submission,
    })
    .from(clanWarParticipantsTable)
    .where(
      and(
        eq(clanWarParticipantsTable.warId, war.id),
        sql`${clanWarParticipantsTable.submission} is not null`,
      ),
    );

  const challengers = submitted.filter((p) => p.side === "challenger");
  const opponents = submitted.filter((p) => p.side === "opponent");
  if (challengers.length === 0 || opponents.length === 0) {
    await restore();
    throw new ClanWarError("conflict", "양측 모두 한 명 이상 주장을 제출해야 확정할 수 있어요.");
  }

  // --- Phase B: AI judge ONCE (outside any transaction). ---
  let verdict: WarVerdict | null;
  try {
    verdict = await judgeWar({
      topic: war.topic,
      challengers: challengers.slice(0, WAR_JUDGE_SUBMISSION_CAP).map((p) => p.submission ?? ""),
      opponents: opponents.slice(0, WAR_JUDGE_SUBMISSION_CAP).map((p) => p.submission ?? ""),
      log: opts.log,
    });
  } catch (err) {
    await restore();
    throw err;
  }
  if (!verdict) {
    await restore();
    throw new ClanWarError("ai_failed", "AI 심판 평가에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }

  const challengerScores = challengers.map((_, i) => verdict.challengerScores[i] ?? 0);
  const opponentScores = opponents.map((_, i) => verdict.opponentScores[i] ?? 0);
  const challengerClanScore = topNAverage(challengerScores, CLAN_SCORE_TOP_N);
  const opponentClanScore = topNAverage(opponentScores, CLAN_SCORE_TOP_N);

  const winnerClanId =
    challengerClanScore > opponentClanScore
      ? war.challengerClanId
      : opponentClanScore > challengerClanScore
        ? war.opponentClanId
        : null;

  // --- Phase C: persist + reward atomically, idempotent on status. If the
  // finalize transaction fails AFTER the claim already committed "completing",
  // the war would be stuck forever — so restore it to its pre-claim status and
  // rethrow so the caller can retry. The AI judge re-runs on retry (still
  // exactly once per successful completion). ---
  try {
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ status: clanWarsTable.status })
      .from(clanWarsTable)
      .where(eq(clanWarsTable.id, war.id))
      .for("update");
    if (!locked || locked.status !== "completing") {
      // The claim was rolled back or finalized elsewhere — do nothing.
      return;
    }

    // Per-participant scores.
    for (let i = 0; i < challengers.length; i++) {
      await tx
        .update(clanWarParticipantsTable)
        .set({
          score: challengerScores[i],
          contributionSummary: verdict.challengerNotes[i] ?? null,
        })
        .where(eq(clanWarParticipantsTable.id, challengers[i].id));
    }
    for (let i = 0; i < opponents.length; i++) {
      await tx
        .update(clanWarParticipantsTable)
        .set({
          score: opponentScores[i],
          contributionSummary: verdict.opponentNotes[i] ?? null,
        })
        .where(eq(clanWarParticipantsTable.id, opponents[i].id));
    }

    await tx
      .update(clanWarsTable)
      .set({
        status: "completed",
        winnerClanId,
        challengerScore: challengerClanScore,
        opponentScore: opponentClanScore,
        endsAt: new Date(),
      })
      .where(eq(clanWarsTable.id, war.id));

    await tx.insert(clanWarResultsTable).values({
      warId: war.id,
      judgeSummary: verdict.judgeSummary,
      challengerFeedback: verdict.challengerFeedback,
      opponentFeedback: verdict.opponentFeedback,
    });

    // Isolated rewards: clan EXP + participant contribution. On a draw both clans
    // receive the loser amount.
    const opponentClanId = war.opponentClanId as string;
    if (winnerClanId) {
      const loserClanId =
        winnerClanId === war.challengerClanId ? opponentClanId : war.challengerClanId;
      await addClanExp(tx, winnerClanId, WAR_WINNER_CLAN_EXP);
      await addClanExp(tx, loserClanId, WAR_LOSER_CLAN_EXP);
    } else {
      await addClanExp(tx, war.challengerClanId, WAR_LOSER_CLAN_EXP);
      await addClanExp(tx, opponentClanId, WAR_LOSER_CLAN_EXP);
    }

    const participantIds = submitted.map((p) => p.id);
    if (participantIds.length > 0) {
      await tx
        .update(clanMembersTable)
        .set({
          contributionExp: sql`${clanMembersTable.contributionExp} + ${WAR_PARTICIPANT_CONTRIBUTION}`,
        })
        .where(
          inArray(
            clanMembersTable.userId,
            submitted.map((p) => p.userId),
          ),
        );
    }
  });
  } catch (err) {
    // Finalize failed after the claim committed — release the "completing" claim
    // so the war isn't stuck. No result/reward was persisted (the txn rolled back).
    await restore();
    throw err;
  }

  opts.log.info(
    { warId: war.id, winnerClanId, challengerClanScore, opponentClanScore },
    "clan war completed",
  );
  return getClanWar({ warId: opts.warId, meUserId: opts.meUserId });
}

// ---------------------------------------------------------------------------
// AI judge
// ---------------------------------------------------------------------------

/** Email / phone-like contact PII — never persisted in AI summary text. */
const PII_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PII_PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;

function scrubPII(text: string): string {
  return text.replace(PII_EMAIL_RE, "[비공개]").replace(PII_PHONE_RE, "[비공개]").trim();
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(50, Math.round(n)));
}

interface WarVerdict {
  challengerScores: number[];
  opponentScores: number[];
  challengerNotes: string[];
  opponentNotes: string[];
  judgeSummary: string;
  challengerFeedback: string;
  opponentFeedback: string;
}

const SCORE_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["logic", "persuasiveness", "evidence", "empathy", "expressiveness", "note"],
  properties: {
    logic: { type: "integer" },
    persuasiveness: { type: "integer" },
    evidence: { type: "integer" },
    empathy: { type: "integer" },
    expressiveness: { type: "integer" },
    note: { type: "string" },
  },
} as const;

interface RawScoreItem {
  logic?: number;
  persuasiveness?: number;
  evidence?: number;
  empathy?: number;
  expressiveness?: number;
  note?: string;
}

function sumItem(it: RawScoreItem): number {
  return clampScore(
    (it.logic ?? 0) +
      (it.persuasiveness ?? 0) +
      (it.evidence ?? 0) +
      (it.empathy ?? 0) +
      (it.expressiveness ?? 0),
  );
}

/**
 * Score every submission in a single AI call. Each item is rated on five 0–10
 * criteria (논리성/설득력/근거/공감/표현력); the participant score is their sum
 * (0–50). Returns null on any failure. Never stores raw submissions — only the
 * model's Korean summary/feedback (with contact PII scrubbed).
 */
async function judgeWar(opts: {
  topic: string;
  challengers: string[];
  opponents: string[];
  log: Logger;
}): Promise<WarVerdict | null> {
  const { topic, challengers, opponents, log } = opts;

  const fmt = (subs: string[]) =>
    subs.map((s, i) => `${i + 1}) ${s.replace(/\s+/g, " ").trim()}`).join("\n") || "(제출 없음)";

  const system = [
    "당신은 한국어 '가문전(클랜 토론 배틀)'의 공정한 AI 심판입니다.",
    "두 가문(도전 가문 challenger, 상대 가문 opponent)의 주장들을 평가합니다.",
    "각 주장을 다음 다섯 항목으로 0~10점 평가하세요: logic(논리성), persuasiveness(설득력), evidence(근거), empathy(공감), expressiveness(표현력).",
    "규칙:",
    "1) 주어진 주장 내용만 근거로 평가하고, 없는 사실을 지어내지 마세요.",
    "2) 과장 없이 공정하고 일관되게 채점하세요.",
    "3) 개인정보(실명·연락처 등)나 특정 개인을 지목하는 표현을 쓰지 마세요.",
    "4) 정치적·종교적 단정이나 논쟁적 주장을 하지 마세요.",
    "5) note와 summary, feedback은 모두 자연스러운 한국어로 1~2문장 이내로 작성하세요.",
    "6) challengerScores는 도전 가문 주장 순서대로, opponentScores는 상대 가문 주장 순서대로 같은 개수로 반환하세요.",
  ].join("\n");

  const user = [
    `## 주제\n${topic}`,
    "",
    `## 도전 가문(challenger) 주장 (${challengers.length}개)`,
    fmt(challengers),
    "",
    `## 상대 가문(opponent) 주장 (${opponents.length}개)`,
    fmt(opponents),
  ].join("\n");

  const schema = {
    type: "object",
    additionalProperties: false,
    required: [
      "challengerScores",
      "opponentScores",
      "judgeSummary",
      "challengerFeedback",
      "opponentFeedback",
    ],
    properties: {
      challengerScores: { type: "array", items: SCORE_ITEM_SCHEMA },
      opponentScores: { type: "array", items: SCORE_ITEM_SCHEMA },
      judgeSummary: { type: "string" },
      challengerFeedback: { type: "string" },
      opponentFeedback: { type: "string" },
    },
  };

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: WAR_MODEL,
      max_completion_tokens: 3000,
      reasoning_effort: "minimal",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "clan_war_verdict", strict: true, schema },
      },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      log.error(
        { finishReason: completion.choices[0]?.finish_reason },
        "Clan war judge returned empty content",
      );
      return null;
    }
    const parsed = JSON.parse(raw) as {
      challengerScores?: RawScoreItem[];
      opponentScores?: RawScoreItem[];
      judgeSummary?: string;
      challengerFeedback?: string;
      opponentFeedback?: string;
    };

    const cItems = Array.isArray(parsed.challengerScores) ? parsed.challengerScores : [];
    const oItems = Array.isArray(parsed.opponentScores) ? parsed.opponentScores : [];

    const judgeSummary = scrubPII(String(parsed.judgeSummary ?? "")).slice(0, 600);
    const challengerFeedback = scrubPII(String(parsed.challengerFeedback ?? "")).slice(0, 600);
    const opponentFeedback = scrubPII(String(parsed.opponentFeedback ?? "")).slice(0, 600);
    if (!judgeSummary || !challengerFeedback || !opponentFeedback) {
      log.error("Clan war judge returned incomplete summary text");
      return null;
    }

    return {
      challengerScores: cItems.map(sumItem),
      opponentScores: oItems.map(sumItem),
      challengerNotes: cItems.map((it) => scrubPII(String(it.note ?? "")).slice(0, 200) || null).map((x) => x ?? ""),
      opponentNotes: oItems.map((it) => scrubPII(String(it.note ?? "")).slice(0, 200) || null).map((x) => x ?? ""),
      judgeSummary,
      challengerFeedback,
      opponentFeedback,
    };
  } catch (err) {
    log.error({ err }, "Clan war judge call failed");
    return null;
  }
}
