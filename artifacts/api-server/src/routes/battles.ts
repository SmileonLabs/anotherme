import { Router, type IRouter } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  battleSessionsTable,
  battleTurnsTable,
  chatRoomMembersTable,
  chatRoomsTable,
  friendshipsTable,
  messagesTable,
  starResultDraftsTable,
  userBattleStatsTable,
  type BattleEvaluation,
  type BattleState,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import {
  battleLevelInfo,
  BATTLE_PERSONAS,
  buildParticipants,
  cancelBattle,
  getOrCreateJudgeUser,
  getOrCreatePersonaUser,
  getPersona,
  markBattleReady,
  resolveAITurn,
  resolveExpiredTurn,
  restartBattle,
  startBattleGame,
  submitBattleTurn,
  suggestTopics,
  toBattleResponse,
  TOTAL_ROUNDS,
  TURN_SECONDS,
  MAX_UTTERANCE_CHARS,
} from "../lib/battle";
import { ensurePlayModeState } from "../lib/fanStar";
import {
  STAR_FEED_POST_BODY_MAX,
} from "../lib/starFeed";
import { roomWithMeta } from "./rooms";
import { rateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-user cooldown for the AI topic suggester to curb credit-cost abuse from
// rapid-fire calls (the endpoint hits OpenAI on every request).
const TOPIC_COOLDOWN_MS = 4000;
const lastTopicCall = new Map<string, number>();

const createBattleFeedPostBodySchema = z.object({
  kind: z.enum(["fan", "star"]).optional(),
});
const battleTopicSchema = z.object({ category: z.string().trim().max(80).optional() }).strict();
const createBattleSchema = z.object({
  memberId: z.uuid().optional(),
  aiPersonaId: z.string().trim().min(1).max(100).optional(),
  category: z.string().trim().max(80).optional(),
  topic: z.string().trim().min(1).max(300),
}).strict().refine((value) => Boolean(value.memberId) !== Boolean(value.aiPersonaId), {
  message: "Provide exactly one opponent",
});
const battleTurnSchema = z.object({
  content: z.string().trim().min(1).max(MAX_UTTERANCE_CHARS),
}).strict();

type BattleFeedKind = "fan" | "star";
type BattleOutcome = "win" | "loss" | "draw";
type BattleAxis = "logic" | "persuasiveness" | "rebuttal" | "wit" | "manners";

interface BattleVibeSummary {
  key: string;
  label: string;
  description: string;
  topAxes: BattleAxis[];
}

interface BattleResultReward {
  label: string;
  value: string;
}

interface BattleResultSummary {
  source: "battle";
  battleRoomId: string;
  matchSeq: number;
  topic: string;
  opponentName: string;
  outcome: BattleOutcome;
  outcomeLabel: string;
  myScore: number;
  opponentScore: number;
  vibe: BattleVibeSummary;
  rewards: BattleResultReward[];
}

const BATTLE_AXIS_KEYS = ["logic", "persuasiveness", "rebuttal", "wit", "manners"] as const;

function outcomeForUser(state: BattleState, userId: string): BattleOutcome {
  if (state.winnerUserId === null) return "draw";
  return state.winnerUserId === userId ? "win" : "loss";
}

function outcomeLabel(outcome: BattleOutcome): string {
  if (outcome === "win") return "승리";
  if (outcome === "loss") return "패배";
  return "무승부";
}

function rewardRows(outcome: BattleOutcome): BattleResultReward[] {
  const tp = outcome === "win" ? 50 : outcome === "draw" ? 20 : 10;
  const xp = outcome === "win" ? 30 : outcome === "draw" ? 15 : 10;
  return [
    { label: "TP", value: `+${tp}` },
    { label: "FAN XP", value: `+${xp}` },
    { label: "자아 프로필", value: "표현 패턴 반영" },
  ];
}

function isBattleEvaluation(value: BattleEvaluation | null | undefined): value is BattleEvaluation {
  return !!value && BATTLE_AXIS_KEYS.every((key) => typeof value[key] === "number");
}

function summarizeVibe(evaluations: BattleEvaluation[]): BattleVibeSummary {
  const valid = evaluations.filter((ev) => !ev.violation);
  if (valid.length === 0) {
    return {
      key: "steady_participant",
      label: "완주형 스피커",
      description: "이번 배틀은 끝까지 참여한 흐름이 먼저 기록됐어요.",
      topAxes: [],
    };
  }

  const averages = BATTLE_AXIS_KEYS.map((key) => ({
    key,
    score: valid.reduce((sum, ev) => sum + ev[key], 0) / valid.length,
  })).sort((a, b) => b.score - a.score);
  const topAxes = averages.slice(0, 2).map((item) => item.key);
  const pair = new Set(topAxes);
  const totalAvg = valid.reduce((sum, ev) => sum + ev.total, 0) / valid.length;

  if (totalAvg >= 42) {
    return {
      key: "stage_controller",
      label: "무대 장악형",
      description: "논리와 설득, 반응 속도가 고르게 살아난 배틀이었어요.",
      topAxes,
    };
  }
  if (pair.has("logic") && pair.has("rebuttal")) {
    return {
      key: "sharp_analyst",
      label: "날카로운 분석가",
      description: "근거를 세우고 상대 주장에 바로 파고드는 흐름이 돋보였어요.",
      topAxes,
    };
  }
  if (pair.has("wit") && pair.has("persuasiveness")) {
    return {
      key: "witty_persuader",
      label: "유쾌한 설득가",
      description: "센스 있는 표현으로 분위기를 잡고 설득까지 이어갔어요.",
      topAxes,
    };
  }
  if (pair.has("manners") && pair.has("logic")) {
    return {
      key: "calm_debater",
      label: "차분한 논객",
      description: "흐트러지지 않는 태도와 논리로 안정감 있게 밀고 갔어요.",
      topAxes,
    };
  }
  if (pair.has("persuasiveness") && pair.has("manners")) {
    return {
      key: "trusted_persuader",
      label: "신뢰형 설득가",
      description: "상대를 존중하면서도 납득시키는 말의 힘이 드러났어요.",
      topAxes,
    };
  }
  if (pair.has("rebuttal") && pair.has("wit")) {
    return {
      key: "quick_rebutter",
      label: "순발력 반박가",
      description: "상대 흐름을 빠르게 받아치며 리듬을 만든 배틀이었어요.",
      topAxes,
    };
  }

  const top = averages[0]?.key;
  if (top === "logic") {
    return {
      key: "evidence_debater",
      label: "근거형 논객",
      description: "감정보다 근거를 앞세우는 토론 흐름이 강했어요.",
      topAxes,
    };
  }
  if (top === "persuasiveness") {
    return {
      key: "empathy_persuader",
      label: "공감형 설득가",
      description: "듣는 사람이 따라오게 만드는 설득 흐름이 좋았어요.",
      topAxes,
    };
  }
  if (top === "rebuttal") {
    return {
      key: "direct_rebutter",
      label: "정면 반박가",
      description: "상대 주장에 물러서지 않고 정면으로 대응했어요.",
      topAxes,
    };
  }
  if (top === "wit") {
    return {
      key: "sense_speaker",
      label: "센스형 스피커",
      description: "표현의 재치로 토론에 생동감을 더했어요.",
      topAxes,
    };
  }
  return {
    key: "fair_player",
    label: "페어플레이 논객",
    description: "토론 태도를 지키며 안정적으로 발언을 이어갔어요.",
    topAxes,
  };
}

async function buildBattleResultSummary(
  roomId: string,
  userId: string,
  state: BattleState,
): Promise<BattleResultSummary | null> {
  const me = state.participants.find((p) => p.userId === userId);
  const opponent = state.participants.find((p) => p.userId !== userId);
  if (!me) return null;

  const currentMatchTurnLimit = Math.max(1, state.totalRounds * Math.max(1, state.participants.length));
  const recentTurns = await db
    .select({
      speakerId: battleTurnsTable.speakerId,
      evaluation: battleTurnsTable.evaluation,
    })
    .from(battleTurnsTable)
    .where(eq(battleTurnsTable.roomId, roomId))
    .orderBy(desc(battleTurnsTable.createdAt))
    .limit(currentMatchTurnLimit);
  const myEvaluations = recentTurns
    .filter((turn) => turn.speakerId === userId && isBattleEvaluation(turn.evaluation))
    .map((turn) => turn.evaluation as BattleEvaluation);
  const outcome = outcomeForUser(state, userId);

  return {
    source: "battle",
    battleRoomId: roomId,
    matchSeq: state.matchSeq ?? 0,
    topic: state.topic,
    opponentName: opponent?.name ?? "상대",
    outcome,
    outcomeLabel: outcomeLabel(outcome),
    myScore: me.totalScore ?? 0,
    opponentScore: opponent?.totalScore ?? 0,
    vibe: summarizeVibe(myEvaluations),
    rewards: rewardRows(outcome),
  };
}

function battleFeedTitle(summary: BattleResultSummary, kind: BattleFeedKind): string {
  return kind === "star"
    ? "공식 STAR 토크배틀 기록"
    : `토크배틀 ${summary.outcomeLabel} 기록`;
}

function battleFeedBody(summary: BattleResultSummary, kind: BattleFeedKind): string {
  const heading = kind === "star" ? "공식 STAR 토크배틀 기록" : "토크배틀 응원 기록";
  return [
    heading,
    `주제: ${summary.topic}`,
    `상대: ${summary.opponentName}`,
    `결과: ${summary.outcomeLabel} (${summary.myScore}:${summary.opponentScore})`,
    `오늘의 바이브: ${summary.vibe.label}`,
    summary.vibe.description,
  ]
    .join("\n")
    .slice(0, STAR_FEED_POST_BODY_MAX);
}

// Suggest debate topics for a category (no room needed).
router.post("/battle-topics", requireAuth, rateLimit({ name: "battle-topics", limit: 10, windowSeconds: 60, requireRedis: true }), async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const now = Date.now();
  const last = lastTopicCall.get(userId) ?? 0;
  if (now - last < TOPIC_COOLDOWN_MS) {
    res.status(429).json({ error: "잠시 후 다시 시도해 주세요." });
    return;
  }
  const parsed = battleTopicSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid battle topic input" });
    return;
  }
  lastTopicCall.set(userId, now);
  const topics = await suggestTopics(parsed.data.category ?? "", req.log);
  res.json({ topics });
});

// List the available AI opponent personas (for the create screen).
router.get("/battle-personas", requireAuth, async (_req, res): Promise<void> => {
  res.json({
    personas: BATTLE_PERSONAS.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      tagline: p.tagline,
    })),
  });
});

// Create a talk-battle: a "battle" chat room with either an invited friend or an
// AI persona opponent, plus the AI judge bot and a fresh waiting-room session.
router.post("/battles", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const parsed = createBattleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide either a friend memberId or an aiPersonaId" });
    return;
  }
  const { memberId, aiPersonaId, category, topic } = parsed.data;
  const hasMember = Boolean(memberId);
  const hasPersona = Boolean(aiPersonaId);

  const judgeId = await getOrCreateJudgeUser();

  // ---- AI opponent ----
  if (hasPersona) {
    const persona = getPersona(aiPersonaId!);
    if (!persona) {
      res.status(400).json({ error: "Unknown AI persona" });
      return;
    }
    const aiBotId = await getOrCreatePersonaUser(persona.id);
    // AI battles have no real opponent to wait on, so both sides are marked ready
    // at creation and the game auto-starts — no waiting room / 준비 step.
    const participants = await buildParticipants([
      { userId, ready: true },
      { userId: aiBotId, isAI: true, personaId: persona.id, ready: true },
    ]);
    const room = await createBattleRoom(userId, [userId, aiBotId, judgeId], topic, category, participants);
    const result = await roomWithMeta(room.id, userId);
    res.status(201).json(result);

    // Kick off the game + the AI's opening turn immediately. Fire-and-forget so
    // creation stays fast; the lock + phase guard make a double-trigger safe.
    void startBattleGame(room.id, req.log)
      .then(() => resolveAITurn(room.id, req.log))
      .catch((err) => req.log.error({ err, roomId: room.id }, "AI battle auto-start failed"));
    return;
  }

  // ---- Friend opponent ----
  if (!UUID_RE.test(memberId!) || memberId === userId) {
    res.status(400).json({ error: "A valid friend memberId is required" });
    return;
  }

  // Only allow inviting an actual friend.
  const friendships = await db
    .select()
    .from(friendshipsTable)
    .where(or(eq(friendshipsTable.userAId, userId), eq(friendshipsTable.userBId, userId)));
  const friendIds = new Set(friendships.map((f) => (f.userAId === userId ? f.userBId : f.userAId)));
  if (!friendIds.has(memberId!)) {
    res.status(403).json({ error: "Can only invite a friend to a battle" });
    return;
  }

  const participants = await buildParticipants([{ userId }, { userId: memberId! }]);
  const room = await createBattleRoom(userId, [userId, memberId!, judgeId], topic, category, participants);
  const result = await roomWithMeta(room.id, userId);
  res.status(201).json(result);
});

// Shared room+session creation for both friend and AI battles.
async function createBattleRoom(
  ownerId: string,
  memberIds: string[],
  topic: string,
  category: string | undefined,
  participants: BattleState["participants"],
) {
  const state: BattleState = {
    topic: topic.trim().slice(0, 200),
    category: (category ?? "").trim().slice(0, 80),
    startQuestion: "",
    phase: "waiting",
    participants,
    totalRounds: TOTAL_ROUNDS,
    timeLimitSeconds: TURN_SECONDS,
    order: [],
    turnIndex: -1,
    currentSpeakerUserId: null,
    turnStartedAt: null,
    ended: false,
    winnerUserId: null,
  };

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(chatRoomsTable)
      .values({ type: "battle", name: "토크배틀", ownerId })
      .returning();
    await tx
      .insert(chatRoomMembersTable)
      .values(memberIds.map((uid) => ({ roomId: created.id, userId: uid })));
    await tx.insert(battleSessionsTable).values({
      roomId: created.id,
      status: "waiting",
      topic: state.topic,
      category: state.category,
      state,
    });
    return created;
  });
}

// Membership guard helper.
async function requireMember(roomId: string, userId: string): Promise<boolean> {
  const [member] = await db
    .select()
    .from(chatRoomMembersTable)
    .where(and(eq(chatRoomMembersTable.roomId, roomId), eq(chatRoomMembersTable.userId, userId)));
  return !!member;
}

// Get current battle state (with lazy timeout resolution).
router.get("/battles/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!(await requireMember(raw, userId))) {
    res.status(403).json({ error: "Not a member" });
    return;
  }

  // A turn whose clock expired with no submission is forfeited here so the game
  // can't stall when a client is gone.
  await resolveExpiredTurn(raw, req.log).catch((err) =>
    req.log.error({ err, roomId: raw }, "resolveExpiredTurn failed"),
  );

  const [session] = await db
    .select()
    .from(battleSessionsTable)
    .where(eq(battleSessionsTable.roomId, raw));
  if (!session) {
    res.status(404).json({ error: "Not a battle" });
    return;
  }
  const response = toBattleResponse(raw, session.state) as ReturnType<typeof toBattleResponse> & {
    resultSummary?: BattleResultSummary;
  };
  if (session.state.phase === "ended" && session.state.ended) {
    const summary = await buildBattleResultSummary(raw, userId, session.state);
    if (summary) response.resultSummary = summary;
  }
  res.json(response);

  // AI battles never use the manual 준비 step. If one is still waiting (e.g. the
  // creation-time auto-start was interrupted), kick it off now so a poll recovers
  // it. Otherwise just generate the AI's turn if it's the AI's move. Fire-and-
  // forget so the read stays fast; lock + phase guards make double-triggers safe.
  const hasAI = session.state.participants.some((p) => p.isAI);
  if (hasAI && session.state.phase === "waiting") {
    void startBattleGame(raw, req.log)
      .then(() => resolveAITurn(raw, req.log))
      .catch((err) => req.log.error({ err, roomId: raw }, "AI battle auto-start (GET) failed"));
  } else {
    void resolveAITurn(raw, req.log).catch((err) =>
      req.log.error({ err, roomId: raw }, "resolveAITurn failed"),
    );
  }
});

// Publish an ended battle result into the STAR feed as either a FAN 응원글 or 공식 STAR 기록.
router.post("/battles/:id/feed-post", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = createBattleFeedPostBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "피드 기록 종류를 확인해 주세요." });
    return;
  }

  if (!(await requireMember(raw, userId))) {
    res.status(403).json({ error: "Not a member" });
    return;
  }

  const [session] = await db
    .select()
    .from(battleSessionsTable)
    .where(eq(battleSessionsTable.roomId, raw));
  if (!session) {
    res.status(404).json({ error: "not_found", message: "토크배틀을 찾을 수 없어요." });
    return;
  }
  if (session.state.phase !== "ended" || !session.state.ended) {
    res.status(409).json({ error: "BATTLE_NOT_ENDED", message: "종료된 토크배틀만 피드에 남길 수 있어요." });
    return;
  }

  const summary = await buildBattleResultSummary(raw, userId, session.state);
  if (!summary) {
    res.status(403).json({ error: "NOT_A_PARTICIPANT", message: "참가한 배틀만 피드에 남길 수 있어요." });
    return;
  }

  const kind = parsed.data.kind ?? "fan";
  let starProfileId: string | null = null;
  if (kind === "star") {
    const state = await ensurePlayModeState(userId);
    if (!state.starUnlocked) {
      res.status(403).json({
        error: "STAR_LOCKED",
        message: "STAR NFT 보유자만 STAR 기록을 남길 수 있어요.",
        state,
      });
      return;
    }
    if (!state.equippedStar) {
      res.status(409).json({
        error: "STAR_NOT_EQUIPPED",
        message: "STAR 기록을 남기려면 먼저 NFT를 장착해 주세요.",
        state,
      });
      return;
    }
    if (state.equippedStar.stage !== "promoted") {
      res.status(403).json({
        error: "TORIMIA_REQUIRED",
        message: "토르미아의 문을 연 공식 STAR만 공식 STAR 기록을 남길 수 있어요.",
        state,
      });
      return;
    }
    starProfileId = state.equippedStar.id;
  }

  const sourceKey = `battle_result_draft:${raw}:${summary.matchSeq}:${userId}:${kind}`;
  const [draft] = await db.insert(starResultDraftsTable).values({
    userId,
    starProfileId,
    sourceType: "battle",
    sourceKey,
    title: battleFeedTitle(summary, kind),
    body: battleFeedBody(summary, kind),
    metadata: {
      ...summary,
      kind,
    },
  }).onConflictDoNothing({ target: starResultDraftsTable.sourceKey }).returning();
  const resultDraft = draft ?? (await db.select().from(starResultDraftsTable).where(eq(starResultDraftsTable.sourceKey, sourceKey)).limit(1))[0];

  res.status(draft ? 201 : 200).json({
    draft: resultDraft,
    duplicate: !draft,
    summary,
  });
});

// Mark yourself ready; auto-starts the game once both players are ready.
router.post("/battles/:id/ready", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!(await requireMember(raw, userId))) {
    res.status(403).json({ error: "Not a member" });
    return;
  }

  // Marking ready is serialized under the room lock so simultaneous readies
  // can't lose-update each other's flag (which would strand the waiting room).
  const result = await markBattleReady(raw, userId);
  if (!result.ok || !result.state) {
    res.status(404).json({ error: result.error ?? "Not a battle" });
    return;
  }

  res.json(toBattleResponse(raw, result.state));

  // Kick off the game (assign sides + AI opening question) without blocking the
  // response; the lock + phase check make a double-trigger safe. If the AI was
  // assigned the first (찬성) turn, generate it right after the game starts.
  if (result.bothReady) {
    void startBattleGame(raw, req.log)
      .then(() => resolveAITurn(raw, req.log))
      .catch((err) => req.log.error({ err, roomId: raw }, "startBattleGame failed"));
  }
});

// Explicit start (host trigger); only proceeds if both are ready.
router.post("/battles/:id/start", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!(await requireMember(raw, userId))) {
    res.status(403).json({ error: "Not a member" });
    return;
  }
  await startBattleGame(raw, req.log).catch((err) =>
    req.log.error({ err, roomId: raw }, "startBattleGame failed"),
  );
  const [session] = await db
    .select()
    .from(battleSessionsTable)
    .where(eq(battleSessionsTable.roomId, raw));
  if (!session) {
    res.status(404).json({ error: "Not a battle" });
    return;
  }
  res.json(toBattleResponse(raw, session.state));

  // Generate the AI's opening turn if it goes first.
  void resolveAITurn(raw, req.log).catch((err) =>
    req.log.error({ err, roomId: raw }, "resolveAITurn failed"),
  );
});

// Cancel a still-waiting battle (host only) and delete its room.
router.post("/battles/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const result = await cancelBattle(raw, userId);
  if (!result.ok) {
    res.status(result.status ?? 400).json({ error: result.error ?? "취소하지 못했습니다" });
    return;
  }
  res.json({ ok: true });
});

// Submit your utterance for the current turn.
router.post("/battles/:id/turn", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = battleTurnSchema.safeParse(req.body);

  if (!(await requireMember(raw, userId))) {
    res.status(403).json({ error: "Not a member" });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const { content } = parsed.data;

  const result = await submitBattleTurn(
    raw,
    userId,
    content,
    req.log,
  );
  if (!result.ok || !result.state) {
    res.status(409).json({ error: result.error ?? "Could not submit turn" });
    return;
  }
  res.json(toBattleResponse(raw, result.state));

  // If the turn now belongs to an AI persona, generate its reply right away.
  void resolveAITurn(raw, req.log).catch((err) =>
    req.log.error({ err, roomId: raw }, "resolveAITurn failed"),
  );
});

// Reset the battle back to the waiting room for another game (다시하기).
router.post("/battles/:id/restart", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!(await requireMember(raw, userId))) {
    res.status(403).json({ error: "Not a member" });
    return;
  }

  // Locked + guarded to phase==="ended" so a restart can't race with an
  // in-progress submission/timeout and clobber a live game.
  const result = await restartBattle(raw);
  if (!result.ok || !result.state) {
    res.status(409).json({ error: result.error ?? "Could not restart battle" });
    return;
  }

  res.json(toBattleResponse(raw, result.state));

  // AI rematches auto-start too — there's no 준비 step. Fire-and-forget so the
  // response stays fast; lock + phase guards make double-triggers safe.
  if (result.state.participants.some((p) => p.isAI)) {
    void startBattleGame(raw, req.log)
      .then(() => resolveAITurn(raw, req.log))
      .catch((err) => req.log.error({ err, roomId: raw }, "AI battle restart auto-start failed"));
  }
});

// My lifetime talk-battle stats (record + TP/level/title) for the dashboard.
router.get("/battle-stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const [row] = await db
    .select()
    .from(userBattleStatsTable)
    .where(eq(userBattleStatsTable.userId, userId));

  const wins = row?.wins ?? 0;
  const losses = row?.losses ?? 0;
  const draws = row?.draws ?? 0;
  const total = wins + losses + draws;
  const mp = row?.mp ?? 0;
  const level = battleLevelInfo(mp);

  res.json({
    wins,
    losses,
    draws,
    total,
    winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
    currentStreak: row?.currentStreak ?? 0,
    bestStreak: row?.bestStreak ?? 0,
    mp,
    level: level.level,
    title: level.title,
    mpIntoLevel: level.mpIntoLevel,
    mpForNextLevel: level.mpForNextLevel,
    mpToNext: level.mpToNext,
  });
});

// Recent finished battles I took part in (dashboard carousel).
router.get("/battle-history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;

  // Ended sessions for rooms I'm a member of, newest first.
  const sessions = await db
    .select({ roomId: battleSessionsTable.roomId, state: battleSessionsTable.state })
    .from(battleSessionsTable)
    .innerJoin(
      chatRoomMembersTable,
      and(
        eq(chatRoomMembersTable.roomId, battleSessionsTable.roomId),
        eq(chatRoomMembersTable.userId, userId),
      ),
    )
    .where(eq(battleSessionsTable.status, "ended"))
    .orderBy(desc(battleSessionsTable.updatedAt))
    .limit(5);

  const items = await Promise.all(
    sessions.map(async ({ roomId, state }) => {
      const me = state.participants.find((p) => p.userId === userId);
      const opponent = state.participants.find((p) => p.userId !== userId);
      const nameById = new Map(state.participants.map((p) => [p.userId, p.name]));

      const outcome: "win" | "loss" | "draw" =
        state.winnerUserId === null
          ? "draw"
          : state.winnerUserId === userId
            ? "win"
            : "loss";

      // The judge's final comment = feedback of the most recent scored turn.
      const [lastTurn] = await db
        .select({ evaluation: battleTurnsTable.evaluation })
        .from(battleTurnsTable)
        .where(eq(battleTurnsTable.roomId, roomId))
        .orderBy(desc(battleTurnsTable.turnIndex))
        .limit(1);

      // Last two debater utterances (text only — excludes judge system lines).
      const recent = await db
        .select({
          senderId: messagesTable.senderId,
          content: messagesTable.content,
        })
        .from(messagesTable)
        .where(and(eq(messagesTable.roomId, roomId), eq(messagesTable.type, "text")))
        .orderBy(desc(messagesTable.createdAt))
        .limit(2);

      const preview = recent
        .reverse()
        .map((m) => ({
          name: nameById.get(m.senderId) ?? "?",
          content: m.content,
          isMe: m.senderId === userId,
        }));

      return {
        roomId,
        topic: state.topic,
        opponentName: opponent?.name ?? "상대",
        opponentAvatarUrl: null as string | null,
        myScore: me?.totalScore ?? 0,
        opponentScore: opponent?.totalScore ?? 0,
        outcome,
        comment: lastTurn?.evaluation?.feedback ?? "",
        preview,
      };
    }),
  );

  res.json(items);
});

export default router;
