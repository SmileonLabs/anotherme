import { Router, type IRouter } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  battleSessionsTable,
  battleTurnsTable,
  chatRoomMembersTable,
  chatRoomsTable,
  friendshipsTable,
  messagesTable,
  userBattleStatsTable,
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
import { roomWithMeta } from "./rooms";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Per-user cooldown for the AI topic suggester to curb credit-cost abuse from
// rapid-fire calls (the endpoint hits OpenAI on every request).
const TOPIC_COOLDOWN_MS = 4000;
const lastTopicCall = new Map<string, number>();

// Suggest debate topics for a category (no room needed).
router.post("/battle-topics", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const now = Date.now();
  const last = lastTopicCall.get(userId) ?? 0;
  if (now - last < TOPIC_COOLDOWN_MS) {
    res.status(429).json({ error: "잠시 후 다시 시도해 주세요." });
    return;
  }
  lastTopicCall.set(userId, now);

  const { category } = req.body as { category?: string };
  const topics = await suggestTopics(typeof category === "string" ? category : "", req.log);
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
  const { memberId, aiPersonaId, category, topic } = req.body as {
    memberId?: string;
    aiPersonaId?: string;
    category?: string;
    topic?: string;
  };

  if (typeof topic !== "string" || !topic.trim()) {
    res.status(400).json({ error: "topic is required" });
    return;
  }

  // Exactly one opponent: a friend (memberId) XOR an AI persona (aiPersonaId).
  const hasMember = typeof memberId === "string" && memberId.length > 0;
  const hasPersona = typeof aiPersonaId === "string" && aiPersonaId.length > 0;
  if (hasMember === hasPersona) {
    res.status(400).json({ error: "Provide either a friend memberId or an aiPersonaId" });
    return;
  }

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
  res.json(toBattleResponse(raw, session.state));

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
  const { content } = req.body as { content?: string };

  if (!(await requireMember(raw, userId))) {
    res.status(403).json({ error: "Not a member" });
    return;
  }
  if (typeof content !== "string") {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const result = await submitBattleTurn(
    raw,
    userId,
    content.slice(0, MAX_UTTERANCE_CHARS),
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

// My lifetime talk-battle stats (record + MP/level/title) for the dashboard.
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
