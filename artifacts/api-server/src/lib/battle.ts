import { and, eq, inArray, sql } from "drizzle-orm";
import type { Logger } from "pino";
import { db } from "@workspace/db";
import {
  battleSessionsTable,
  battleTurnsTable,
  chatRoomMembersTable,
  chatRoomsTable,
  messagesTable,
  userBattleStatsTable,
  usersTable,
  type BattleEvaluation,
  type BattleParticipant,
  type BattleState,
} from "@workspace/db";
import { getOpenAI } from "./aiClient";
import { recordActivity } from "./growth";

const JUDGE_EMAIL = "talk-judge@todotalk.system";
const JUDGE_CLERK_ID = "system:talk-judge";
export const JUDGE_NICKNAME = "AI 심판";

const BATTLE_MODEL = "gpt-5-mini";

// ---------------------------------------------------------------------------
// AI opponent personas. Each persona becomes a system bot user (like the judge)
// and debates the human as a real participant — scored by the same AI judge.
// `voice` is injected into the generation prompt so the AI argues in character.
// ---------------------------------------------------------------------------
export interface BattlePersona {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  voice: string;
}

export const BATTLE_PERSONAS: BattlePersona[] = [
  {
    id: "judge",
    name: "AI 판사",
    emoji: "⚖️",
    tagline: "근엄하고 논리정연한 판사",
    voice:
      "근엄하고 논리정연한 판사. 법정 용어와 단호한 어조를 쓰며, '이의 있습니다', '판결하건대' 같은 표현으로 상대 주장의 허점을 조목조목 반박한다.",
  },
  {
    id: "pastor",
    name: "AI 목사",
    emoji: "🙏",
    tagline: "온화하지만 은근히 몰아붙이는 목사님",
    voice:
      "온화한 말투의 목사님. 비유와 설교조로 부드럽게 시작하지만, '형제여' 하고 다독이는 척하면서 은근슬쩍 상대를 코너로 모는 능청스러움이 있다.",
  },
  {
    id: "ajumma",
    name: "AI 옆집 아줌마",
    emoji: "💅",
    tagline: "오지랖 만렙 사이다 아줌마",
    voice:
      "오지랖 넓은 옆집 아줌마. 친근한 반말과 시장통 정서로 '아유 그게 말이 되니~' 하며 들이대고, 사이다 같은 직설로 상대를 몰아붙인다. 가끔 자식·남편 얘기로 비유한다.",
  },
  {
    id: "celeb",
    name: "AI 연예전문가",
    emoji: "🎤",
    tagline: "트렌디한 연예계 패널",
    voice:
      "트렌디한 연예 전문 패널. 핫한 신조어와 연예계 비유('이건 완전 역대급 떡밥이죠')를 섞어 가볍지만 날카롭게 상대 주장을 디스한다.",
  },
  {
    id: "philosopher",
    name: "AI 철학자",
    emoji: "🧐",
    tagline: "본질을 파고드는 사색가",
    voice:
      "심오한 철학자. 사색적이고 현학적인 어조로 '과연 그러한가?' 하며 상대 전제의 본질을 되묻고, 사고실험과 역설로 허를 찌른다.",
  },
  {
    id: "chuuni",
    name: "AI 중2병 소년",
    emoji: "🔥",
    tagline: "허세 폭발 흑염룡 소년",
    voice:
      "허세 가득한 중2병 소년. '크큭… 내 안의 흑염룡이' 같은 과장된 화법과 필살기 같은 비장한 어조로 주장하지만, 의외로 논점은 정확히 찌른다.",
  },
];

const personaById = new Map(BATTLE_PERSONAS.map((p) => [p.id, p]));

export function getPersona(id: string): BattlePersona | undefined {
  return personaById.get(id);
}

export const TOTAL_ROUNDS = 3;
export const TURN_SECONDS = 45;
/** Hard cap on an utterance so a single turn can't blow up the AI prompt. */
export const MAX_UTTERANCE_CHARS = 1000;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

let cachedJudgeUserId: string | null = null;

// Cache of system bot user ids keyed by email (judge + each AI persona).
const cachedBotUserIds = new Map<string, string>();

/** Get (or lazily create) a system bot user by email, returning its id. */
async function getOrCreateBotUser(opts: {
  email: string;
  clerkId: string;
  nickname: string;
  statusMessage: string;
}): Promise<string> {
  const cached = cachedBotUserIds.get(opts.email);
  if (cached) return cached;
  await db
    .insert(usersTable)
    .values({
      clerkId: opts.clerkId,
      email: opts.email,
      nickname: opts.nickname,
      statusMessage: opts.statusMessage,
      notificationEnabled: false,
    })
    .onConflictDoNothing({ target: usersTable.email });
  const [u] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, opts.email));
  cachedBotUserIds.set(opts.email, u.id);
  return u.id;
}

/** Get (or lazily create) the system "AI 심판" bot user id. */
export async function getOrCreateJudgeUser(): Promise<string> {
  if (cachedJudgeUserId) return cachedJudgeUserId;
  const id = await getOrCreateBotUser({
    email: JUDGE_EMAIL,
    clerkId: JUDGE_CLERK_ID,
    nickname: JUDGE_NICKNAME,
    statusMessage: "⚖️ 토크배틀을 진행하고 평가하는 AI 심판",
  });
  cachedJudgeUserId = id;
  return id;
}

/** Get (or lazily create) the bot user for an AI opponent persona. */
export async function getOrCreatePersonaUser(personaId: string): Promise<string> {
  const persona = getPersona(personaId);
  if (!persona) throw new Error(`Unknown battle persona: ${personaId}`);
  return getOrCreateBotUser({
    email: `talk-ai-${persona.id}@todotalk.system`,
    clerkId: `system:talk-ai-${persona.id}`,
    nickname: persona.name,
    statusMessage: `${persona.emoji} ${persona.tagline}`,
  });
}

// ---------------------------------------------------------------------------
// Per-room mutex so concurrent submissions / starts on the same room are
// serialized (mirrors the dungeon design).
// ---------------------------------------------------------------------------
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(roomId) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  // Keep the chain alive but swallow errors so one failure doesn't poison the lock.
  locks.set(
    roomId,
    run.catch(() => undefined),
  );
  return run;
}

// ---------------------------------------------------------------------------
// AI helpers
// ---------------------------------------------------------------------------
async function callJson<T>(
  system: string,
  user: string,
  schemaName: string,
  schema: Record<string, unknown>,
  log: Logger,
  maxTokens = 1500,
): Promise<T | null> {
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: BATTLE_MODEL,
      max_completion_tokens: maxTokens,
      reasoning_effort: "minimal",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema },
      },
    });
    const choice = completion.choices[0];
    const raw = choice?.message?.content;
    if (!raw) {
      log.error(
        { finishReason: choice?.finish_reason, usage: completion.usage },
        `Battle AI (${schemaName}) returned empty content`,
      );
      return null;
    }
    return JSON.parse(raw) as T;
  } catch (err) {
    log.error({ err }, `Battle AI (${schemaName}) call failed`);
    return null;
  }
}

const FALLBACK_TOPICS: Record<string, string[]> = {
  default: [
    "탕수육은 부먹이 옳다",
    "여행은 계획파가 무계획파보다 낫다",
    "민트초코는 맛있다",
    "재택근무가 출근보다 생산적이다",
    "겨울이 여름보다 좋은 계절이다",
  ],
};

/** Suggest five debatable topics for a category. */
export async function suggestTopics(category: string, log: Logger): Promise<string[]> {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["topics"],
    properties: {
      topics: { type: "array", items: { type: "string" }, minItems: 5, maxItems: 5 },
    },
  };
  const result = await callJson<{ topics: string[] }>(
    [
      "당신은 둘이서 즐기는 '말싸움(토론) 게임'의 주제를 만드는 도우미입니다.",
      "반드시 한국어로만 답하세요.",
      "찬성/반대로 입장이 명확히 갈리고, 어느 한쪽이 일방적으로 옳지 않아 양쪽 다 그럴듯하게 주장할 수 있는 가볍고 재미있는 주제 5개를 만드세요.",
      "각 주제는 한 문장의 '단언/주장' 형태로 쓰세요(예: '탕수육은 부먹이 옳다').",
      "너무 무겁거나 정치적으로 민감한 주제는 피하고, 친구끼리 즐길 만한 톤으로.",
    ].join("\n"),
    `카테고리: ${category || "자유"}`,
    "battle_topics",
    schema,
    log,
    1200,
  );
  const topics = (result?.topics ?? [])
    .filter((t) => typeof t === "string" && t.trim())
    .map((t) => t.trim().slice(0, 100));
  if (topics.length >= 2) return topics.slice(0, 5);
  return FALLBACK_TOPICS.default;
}

/** Generate the opening question that frames the debate. */
async function generateStartQuestion(topic: string, log: Logger): Promise<string> {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["question"],
    properties: { question: { type: "string" } },
  };
  const result = await callJson<{ question: string }>(
    [
      "당신은 둘이서 찬성/반대로 겨루는 말싸움(토론) 게임의 AI 심판이자 사회자입니다.",
      "반드시 한국어로만 답하세요.",
      "주어진 주제로 토론을 여는 짧고 흥미로운 시작 질문(2~3문장)을 만드세요. 찬성·반대 양측에게 첫 발언을 유도하는 톤으로 쓰되, 어느 한쪽 편을 들지 마세요.",
    ].join("\n"),
    `주제: ${topic}`,
    "battle_question",
    schema,
    log,
    800,
  );
  return result?.question?.trim() || `오늘의 주제는 "${topic}" 입니다. 양측의 첫 발언을 들어보겠습니다!`;
}

const EVAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["logic", "persuasiveness", "rebuttal", "wit", "manners", "feedback", "violation"],
  properties: {
    logic: { type: "integer", description: "논리력 0~10" },
    persuasiveness: { type: "integer", description: "설득력 0~10" },
    rebuttal: { type: "integer", description: "반박력 0~10" },
    wit: { type: "integer", description: "재치 0~10" },
    manners: { type: "integer", description: "예의 0~10" },
    feedback: { type: "string", description: "한국어 한두 문장 평가" },
    violation: {
      type: "boolean",
      description: "욕설/인신공격/혐오 표현 포함 여부",
    },
  },
};

interface RawEvaluation {
  logic: number;
  persuasiveness: number;
  rebuttal: number;
  wit: number;
  manners: number;
  feedback: string;
  violation: boolean;
}

/** Ask the judge to score one utterance. Empty content is forfeited without an AI call. */
async function evaluateUtterance(
  args: { topic: string; side: "pro" | "con" | ""; round: number; content: string },
  log: Logger,
): Promise<BattleEvaluation> {
  const content = args.content.trim();
  if (!content) {
    return {
      logic: 0,
      persuasiveness: 0,
      rebuttal: 0,
      wit: 0,
      manners: 0,
      total: 0,
      feedback: "시간 안에 발언이 없었습니다. (0점)",
      violation: false,
    };
  }

  const sideLabel = args.side === "pro" ? "찬성" : args.side === "con" ? "반대" : "참가자";
  const result = await callJson<RawEvaluation>(
    [
      "당신은 둘이서 찬성/반대로 겨루는 말싸움(토론) 게임의 엄정한 AI 심판입니다.",
      "반드시 한국어로만 답하세요.",
      "참가자의 한 번의 발언을 다음 5개 항목으로 0~10점씩 평가하세요: 논리력(logic), 설득력(persuasiveness), 반박력(rebuttal), 재치(wit), 예의(manners).",
      "발언이 자신의 입장(찬성/반대)에 부합하고 근거가 탄탄하며 상대 주장을 잘 반박할수록 높은 점수를 주세요.",
      "욕설, 인신공격, 혐오 표현이 있으면 violation=true로 표시하고 예의(manners) 점수를 0~2로 크게 깎으세요. 그 외 항목도 발언의 질에 따라 평가하세요.",
      "feedback에는 잘한 점과 아쉬운 점을 짚는 한두 문장의 건설적인 한국어 코멘트를 쓰세요.",
    ].join("\n"),
    [
      `토론 주제: ${args.topic}`,
      `이 참가자의 입장: ${sideLabel}`,
      `라운드: ${args.round}`,
      `발언 내용:`,
      content.slice(0, MAX_UTTERANCE_CHARS),
    ].join("\n"),
    "battle_evaluation",
    EVAL_SCHEMA,
    log,
    1200,
  );

  if (!result) {
    // AI unavailable: give a neutral mid score so the game can still progress.
    return {
      logic: 5,
      persuasiveness: 5,
      rebuttal: 5,
      wit: 5,
      manners: 5,
      total: 25,
      feedback: "심판이 일시적으로 평가하지 못해 기본 점수를 부여했습니다.",
      violation: false,
    };
  }

  const logic = clamp(result.logic, 0, 10);
  const persuasiveness = clamp(result.persuasiveness, 0, 10);
  const rebuttal = clamp(result.rebuttal, 0, 10);
  const wit = clamp(result.wit, 0, 10);
  const manners = clamp(result.manners, 0, 10);
  const violation = !!result.violation;
  // Abuse forfeits the round's score even if individual axes leaked through.
  const total = violation ? 0 : logic + persuasiveness + rebuttal + wit + manners;
  return {
    logic,
    persuasiveness,
    rebuttal,
    wit,
    manners,
    total,
    feedback: (result.feedback || "").trim().slice(0, 400) || "평가 코멘트가 없습니다.",
    violation,
  };
}

/**
 * Generate the AI opponent's utterance for its current turn, in the persona's
 * voice. Receives the recent transcript so it can rebut the human. Always
 * returns a non-empty string (falls back to an in-character line on AI failure)
 * so the turn can always complete.
 */
async function generateAIUtterance(
  args: {
    persona: BattlePersona;
    topic: string;
    side: "pro" | "con" | "";
    round: number;
    transcript: string;
  },
  log: Logger,
): Promise<string> {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["utterance"],
    properties: { utterance: { type: "string" } },
  };
  const sideLabel = args.side === "pro" ? "찬성" : args.side === "con" ? "반대" : "참가자";
  const result = await callJson<{ utterance: string }>(
    [
      `당신은 '${args.persona.name}' 캐릭터로 말싸움(토론) 게임에 참가한 상대 선수입니다.`,
      `캐릭터 설정: ${args.persona.voice}`,
      "반드시 한국어로만, 캐릭터의 말투를 유지하며 답하세요.",
      `당신의 입장은 '${sideLabel}'입니다. 이 입장을 일관되게 옹호하고, 상대의 직전 발언이 있으면 그 허점을 재치있게 반박하세요.`,
      "1~3문장(최대 4문장)으로 짧고 임팩트 있게 말하세요. 욕설·인신공격·혐오 표현은 절대 쓰지 마세요(예의 점수에서 감점됩니다).",
      "해설이나 메타 발언 없이, 실제 토론에서 입 밖으로 내뱉을 발언 그 자체만 쓰세요.",
    ].join("\n"),
    [
      `토론 주제: ${args.topic}`,
      `현재 라운드: ${args.round}`,
      args.transcript ? `지금까지의 발언:\n${args.transcript}` : "아직 상대 발언이 없습니다. 첫 발언을 시작하세요.",
    ].join("\n"),
    "battle_ai_utterance",
    schema,
    log,
    1500,
  );
  const text = (result?.utterance ?? "").trim();
  if (text) return text.slice(0, MAX_UTTERANCE_CHARS);
  // AI unavailable: an in-character fallback so the game still advances.
  return `${args.persona.emoji} (${args.persona.name}이(가) 잠시 말을 고르고 있습니다.) 그래도 제 입장은 '${sideLabel}'입니다.`;
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------
export function computeRemaining(state: BattleState): number {
  if (state.phase !== "active" || !state.turnStartedAt) return 0;
  const elapsed = (Date.now() - new Date(state.turnStartedAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(state.timeLimitSeconds - elapsed));
}

/** Grace window (seconds) absorbing network/clock skew before a turn is forfeited. */
const EXPIRY_GRACE = 2;

/** Signed seconds left in the current turn (negative once past the limit). */
function secondsLeft(state: BattleState): number {
  if (state.phase !== "active" || !state.turnStartedAt) return 0;
  return state.timeLimitSeconds - (Date.now() - new Date(state.turnStartedAt).getTime()) / 1000;
}

function isExpired(state: BattleState): boolean {
  return secondsLeft(state) <= -EXPIRY_GRACE;
}

/** Whether the current speaker is an AI persona (its turn is server-generated). */
function currentSpeakerIsAI(state: BattleState): boolean {
  const cur = state.participants.find((p) => p.userId === state.currentSpeakerUserId);
  return !!cur?.isAI;
}

export function roundOf(turnIndex: number): number {
  return Math.floor(turnIndex / 2) + 1;
}

// ---------------------------------------------------------------------------
// Lifetime stats (말빨 현황) — MP / level / win-loss record
// ---------------------------------------------------------------------------

/** MP awarded per battle outcome (drives level/title growth). */
const MP_WIN = 50;
const MP_DRAW = 20;
const MP_LOSS = 10;

/** Flat MP span per level (mirrors the dashboard's "X / 500" progress bar). */
const LEVEL_SPAN = 500;

/** Level titles (칭호) by 1-based level; the last one applies to all higher levels. */
const LEVEL_TITLES = [
  "말문 트임",
  "입문 토론자",
  "수습 논객",
  "논리 초보",
  "열혈 토론가",
  "설득가",
  "날카로운 혀",
  "말빨 고수",
  "토론의 달인",
  "솔로몬의 후예",
] as const;

export interface BattleLevelInfo {
  level: number;
  title: string;
  /** MP accumulated within the current level (0..LEVEL_SPAN-1). */
  mpIntoLevel: number;
  /** MP span of a level (constant). */
  mpForNextLevel: number;
  /** MP remaining until the next level. */
  mpToNext: number;
}

/** Deterministically derive level/title/progress from total MP. */
export function battleLevelInfo(mp: number): BattleLevelInfo {
  const safe = Math.max(0, Math.floor(mp));
  const level = Math.floor(safe / LEVEL_SPAN) + 1;
  const mpIntoLevel = safe % LEVEL_SPAN;
  const title = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];
  return {
    level,
    title,
    mpIntoLevel,
    mpForNextLevel: LEVEL_SPAN,
    mpToNext: LEVEL_SPAN - mpIntoLevel,
  };
}

/**
 * Record lifetime stats for each *human* participant of a just-ended battle.
 * Called exactly once per game-over (right after `advanceTurn` flips
 * `state.ended`), so wins/losses/streaks/MP increment by one battle. AI persona
 * bots are skipped. A `restart` legitimately starts a fresh game whose result is
 * recorded again. Best-effort: failures are logged, never thrown (the battle is
 * already ended regardless).
 */
export async function recordBattleResultStats(state: BattleState, log: Logger): Promise<void> {
  const humans = state.participants.filter((p) => !p.isAI);
  for (const p of humans) {
    const outcome: "win" | "loss" | "draw" =
      state.winnerUserId === null
        ? "draw"
        : state.winnerUserId === p.userId
          ? "win"
          : "loss";
    const isWin = outcome === "win";
    const isLoss = outcome === "loss";
    const isDraw = outcome === "draw";
    const mpGain = isWin ? MP_WIN : isDraw ? MP_DRAW : MP_LOSS;

    try {
      await db
        .insert(userBattleStatsTable)
        .values({
          userId: p.userId,
          wins: isWin ? 1 : 0,
          losses: isLoss ? 1 : 0,
          draws: isDraw ? 1 : 0,
          currentStreak: isWin ? 1 : 0,
          bestStreak: isWin ? 1 : 0,
          mp: mpGain,
        })
        .onConflictDoUpdate({
          target: userBattleStatsTable.userId,
          set: {
            wins: sql`${userBattleStatsTable.wins} + ${isWin ? 1 : 0}`,
            losses: sql`${userBattleStatsTable.losses} + ${isLoss ? 1 : 0}`,
            draws: sql`${userBattleStatsTable.draws} + ${isDraw ? 1 : 0}`,
            // Win extends the streak; loss/draw resets it to 0.
            currentStreak: isWin
              ? sql`${userBattleStatsTable.currentStreak} + 1`
              : sql`0`,
            bestStreak: isWin
              ? sql`GREATEST(${userBattleStatsTable.bestStreak}, ${userBattleStatsTable.currentStreak} + 1)`
              : userBattleStatsTable.bestStreak,
            mp: sql`${userBattleStatsTable.mp} + ${mpGain}`,
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      log.error({ err, userId: p.userId }, "recordBattleResultStats failed");
    }

    // Grow the participant's persona from the battle outcome (self-isolated).
    const growthSource = isWin ? "battle_win" : isLoss ? "battle_loss" : "battle_draw";
    void recordActivity(p.userId, growthSource, { log });
  }
}

/** Shape the persisted session into the API response (adds server-computed time). */
export function toBattleResponse(roomId: string, state: BattleState) {
  return {
    roomId,
    status: state.phase,
    // The host (battle creator) is always the first participant — buildParticipants
    // keeps creation order and restartBattle preserves it. Used client-side to
    // show the "신청 취소" button only to the host while waiting.
    hostUserId: state.participants[0]?.userId ?? null,
    topic: state.topic,
    category: state.category,
    startQuestion: state.startQuestion,
    phase: state.phase,
    participants: state.participants,
    totalRounds: state.totalRounds,
    round: state.turnIndex >= 0 ? Math.min(roundOf(state.turnIndex), state.totalRounds) : 0,
    timeLimitSeconds: state.timeLimitSeconds,
    turnIndex: state.turnIndex,
    currentSpeakerUserId: state.currentSpeakerUserId,
    turnStartedAt: state.turnStartedAt,
    remainingSeconds: computeRemaining(state),
    ended: state.ended,
    winnerUserId: state.winnerUserId,
  };
}

/** Descriptor for a battle participant when building the waiting room. */
export interface ParticipantInput {
  userId: string;
  /** Whether the participant is an AI persona opponent. */
  isAI?: boolean;
  /** Persona id when isAI; drives the AI's voice/avatar. */
  personaId?: string;
  /** Initial ready flag (AI opponents start ready so a single human can begin). */
  ready?: boolean;
}

/** Build the initial waiting-room participants (creator first), naming them from the users table. */
export async function buildParticipants(
  entries: ParticipantInput[],
): Promise<BattleParticipant[]> {
  const ids = entries.map((e) => e.userId);
  const rows = await db
    .select({ id: usersTable.id, nickname: usersTable.nickname })
    .from(usersTable)
    .where(inArray(usersTable.id, ids));
  const nameById = new Map(rows.map((r) => [r.id, r.nickname]));
  return entries.map((e) => ({
    userId: e.userId,
    name: nameById.get(e.userId) ?? (e.isAI ? "AI" : "참가자"),
    side: "" as const,
    totalScore: 0,
    ready: e.ready ?? false,
    ...(e.isAI ? { isAI: true, personaId: e.personaId } : {}),
  }));
}

/**
 * Advance to the next turn after a speaker's turn has been scored. Mutates
 * `state` and returns system lines to post (round banners / result line).
 */
function advanceTurn(state: BattleState): string[] {
  const lines: string[] = [];
  const nextIndex = state.turnIndex + 1;
  if (nextIndex >= state.totalRounds * 2) {
    // Game over.
    state.turnIndex = nextIndex;
    state.phase = "ended";
    state.ended = true;
    state.currentSpeakerUserId = null;
    state.turnStartedAt = null;
    const [a, b] = state.participants;
    if (a && b) {
      if (a.totalScore > b.totalScore) state.winnerUserId = a.userId;
      else if (b.totalScore > a.totalScore) state.winnerUserId = b.userId;
      else state.winnerUserId = null;
    }
    const result =
      state.winnerUserId === null
        ? `🏁 토론 종료! 무승부입니다. (${state.participants
            .map((p) => `${p.name} ${p.totalScore}점`)
            .join(" vs ")})`
        : `🏁 토론 종료! 승자는 ${
            state.participants.find((p) => p.userId === state.winnerUserId)?.name ?? "?"
          } 님입니다. (${state.participants.map((p) => `${p.name} ${p.totalScore}점`).join(" vs ")})`;
    lines.push(result);
    return lines;
  }
  state.turnIndex = nextIndex;
  state.currentSpeakerUserId = state.order[nextIndex % 2] ?? null;
  state.turnStartedAt = new Date().toISOString();
  if (nextIndex % 2 === 0) {
    lines.push(`🔔 라운드 ${roundOf(nextIndex)} 시작`);
  }
  return lines;
}

/** Insert ordered system messages from the judge bot, returning the last id. */
async function postSystemLines(
  tx: typeof db,
  roomId: string,
  judgeId: string,
  lines: string[],
  baseTime: number,
): Promise<string | undefined> {
  let lastId: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const [m] = await tx
      .insert(messagesTable)
      .values({
        roomId,
        senderId: judgeId,
        type: "system",
        content: lines[i],
        createdAt: new Date(baseTime + i),
      })
      .returning();
    lastId = m.id;
  }
  return lastId;
}

// ---------------------------------------------------------------------------
// Game actions
// ---------------------------------------------------------------------------

/**
 * Start the debate once both players are ready: assign sides randomly, generate
 * the opening question, and begin round 1. Guarded so a double-trigger (both
 * clients readying at once) only starts the game once.
 */
export async function startBattleGame(roomId: string, log: Logger): Promise<void> {
  await withLock(roomId, async () => {
    const [session] = await db
      .select()
      .from(battleSessionsTable)
      .where(eq(battleSessionsTable.roomId, roomId));
    if (!session) return;
    const state = session.state;
    if (state.phase !== "waiting") return;
    if (state.participants.length < 2 || !state.participants.every((p) => p.ready)) return;

    // Random side assignment.
    const shuffled = [...state.participants];
    if (Math.random() < 0.5) shuffled.reverse();
    shuffled[0].side = "pro";
    shuffled[1].side = "con";
    const proId = shuffled[0].userId;
    const conId = shuffled[1].userId;

    const question = await generateStartQuestion(state.topic, log);

    state.startQuestion = question;
    state.order = [proId, conId];
    state.turnIndex = 0;
    state.currentSpeakerUserId = proId;
    state.turnStartedAt = new Date().toISOString();
    state.phase = "active";

    const judgeId = await getOrCreateJudgeUser();
    const proName = shuffled[0].name;
    const conName = shuffled[1].name;
    await db.transaction(async (tx) => {
      const base = Date.now();
      const lines = [
        `⚖️ 토크배틀 시작! 주제: "${state.topic}"`,
        `🙌 ${proName} = 찬성, ${conName} = 반대`,
        question,
        `🔔 라운드 1 시작 — 먼저 찬성 측 ${proName} 님의 발언입니다.`,
      ];
      const lastId = await postSystemLines(tx as unknown as typeof db, roomId, judgeId, lines, base);
      await tx
        .update(chatRoomsTable)
        .set({ lastMessage: "토크배틀이 시작되었습니다", lastMessageAt: new Date() })
        .where(eq(chatRoomsTable.id, roomId));
      if (lastId) {
        await tx
          .update(chatRoomMembersTable)
          .set({ lastReadMessageId: lastId })
          .where(eq(chatRoomMembersTable.roomId, roomId));
      }
      await tx
        .update(battleSessionsTable)
        .set({ state, status: "active" })
        .where(eq(battleSessionsTable.roomId, roomId));
    });
  });
}

interface SubmitResult {
  ok: boolean;
  error?: string;
  state?: BattleState;
}

/**
 * Submit (and evaluate) the current speaker's utterance, then advance the turn.
 * `userId` must be the current speaker. Empty content is accepted as a forfeit.
 */
export async function submitBattleTurn(
  roomId: string,
  userId: string,
  content: string,
  log: Logger,
): Promise<SubmitResult> {
  return withLock(roomId, async () => {
    const [session] = await db
      .select()
      .from(battleSessionsTable)
      .where(eq(battleSessionsTable.roomId, roomId));
    if (!session) return { ok: false, error: "Not a battle" };
    const state = session.state;
    if (state.phase !== "active") return { ok: false, error: "Battle is not active" };
    if (state.currentSpeakerUserId !== userId) return { ok: false, error: "Not your turn" };

    const speaker = state.participants.find((p) => p.userId === userId);
    const side = speaker?.side ?? "";
    const round = roundOf(state.turnIndex);
    const turnIndex = state.turnIndex;
    // Server-authoritative timer: a submission arriving past the limit (late
    // poll or a malicious direct call) is forfeited (0 points, no AI call)
    // rather than scored.
    const expired = isExpired(state);
    const trimmed = expired ? "" : content.slice(0, MAX_UTTERANCE_CHARS);

    const evaluation = await evaluateUtterance(
      { topic: state.topic, side, round, content: trimmed },
      log,
    );
    if (expired) {
      evaluation.feedback = "시간 초과로 발언이 인정되지 않았습니다. (0점)";
    }

    if (speaker) speaker.totalScore += evaluation.total;

    const judgeId = await getOrCreateJudgeUser();
    const speakerName = speaker?.name ?? "참가자";
    const sideLabel = side === "pro" ? "찬성" : side === "con" ? "반대" : "";
    const evalLine = evaluation.violation
      ? `⚖️ ${speakerName}(${sideLabel}) 평가 — ⚠️ 부적절한 표현으로 0점\n${evaluation.feedback}`
      : `⚖️ ${speakerName}(${sideLabel}) 평가 — 논리 ${evaluation.logic} · 설득 ${evaluation.persuasiveness} · 반박 ${evaluation.rebuttal} · 재치 ${evaluation.wit} · 예의 ${evaluation.manners} = ${evaluation.total}점\n${evaluation.feedback}`;

    const advanceLines = advanceTurn(state);

    await db.transaction(async (tx) => {
      const base = Date.now();
      // 1) the speaker's own utterance bubble (skip if forfeit/empty).
      if (trimmed.trim()) {
        await tx.insert(messagesTable).values({
          roomId,
          senderId: userId,
          type: "text",
          content: trimmed.trim(),
          createdAt: new Date(base),
        });
      }
      // 2) record the normalized turn + evaluation.
      await tx.insert(battleTurnsTable).values({
        roomId,
        round,
        turnIndex,
        speakerId: userId,
        side,
        content: trimmed.trim(),
        evaluation,
      });
      // 3) judge evaluation + any round/result banners.
      const lastId = await postSystemLines(
        tx as unknown as typeof db,
        roomId,
        judgeId,
        [evalLine, ...advanceLines],
        base + 1,
      );
      await tx
        .update(chatRoomsTable)
        .set({ lastMessage: `${speakerName} ${evaluation.total}점`, lastMessageAt: new Date() })
        .where(eq(chatRoomsTable.id, roomId));
      if (lastId) {
        await tx
          .update(chatRoomMembersTable)
          .set({ lastReadMessageId: lastId })
          .where(eq(chatRoomMembersTable.roomId, roomId));
      }
      await tx
        .update(battleSessionsTable)
        .set({ state, status: state.phase })
        .where(eq(battleSessionsTable.roomId, roomId));
    });

    // Grow the speaker's persona from this turn (human speakers only; AI turns
    // never run through here). Self-isolated fire-and-forget.
    if (speaker && !speaker.isAI) {
      void recordActivity(userId, "battle_turn", { refId: roomId, log });
    }

    if (state.ended) await recordBattleResultStats(state, log);

    return { ok: true, state };
  });
}

/**
 * If the current turn's clock has run out and nobody submitted, forfeit it
 * (0 points) and advance. Cheap (no AI call); called lazily on reads so a game
 * can't stall when a client is gone. Returns true if it resolved a turn.
 */
export async function resolveExpiredTurn(roomId: string, log: Logger): Promise<boolean> {
  const [peek] = await db
    .select()
    .from(battleSessionsTable)
    .where(eq(battleSessionsTable.roomId, roomId));
  if (!peek || peek.state.phase !== "active") return false;
  // AI turns have no clock — they're resolved by resolveAITurn, never forfeited.
  if (currentSpeakerIsAI(peek.state)) return false;
  if (!isExpired(peek.state)) return false;

  return withLock(roomId, async () => {
    const [session] = await db
      .select()
      .from(battleSessionsTable)
      .where(eq(battleSessionsTable.roomId, roomId));
    if (!session || session.state.phase !== "active") return false;
    const state = session.state;
    if (currentSpeakerIsAI(state)) return false;
    if (!isExpired(state)) return false; // someone beat us to it (or just submitted)

    const speaker = state.participants.find((p) => p.userId === state.currentSpeakerUserId);
    const speakerName = speaker?.name ?? "참가자";
    const round = roundOf(state.turnIndex);
    const turnIndex = state.turnIndex;
    const side = speaker?.side ?? "";

    const evaluation: BattleEvaluation = {
      logic: 0,
      persuasiveness: 0,
      rebuttal: 0,
      wit: 0,
      manners: 0,
      total: 0,
      feedback: "시간 초과로 발언이 제출되지 않았습니다.",
      violation: false,
    };

    const judgeId = await getOrCreateJudgeUser();
    const advanceLines = advanceTurn(state);

    await db.transaction(async (tx) => {
      const base = Date.now();
      await tx.insert(battleTurnsTable).values({
        roomId,
        round,
        turnIndex,
        speakerId: speaker?.userId ?? judgeId,
        side,
        content: "",
        evaluation,
      });
      const lastId = await postSystemLines(
        tx as unknown as typeof db,
        roomId,
        judgeId,
        [`⏰ ${speakerName} 시간 초과 — 발언 없음 (0점)`, ...advanceLines],
        base,
      );
      await tx
        .update(chatRoomsTable)
        .set({ lastMessage: `${speakerName} 시간 초과`, lastMessageAt: new Date() })
        .where(eq(chatRoomsTable.id, roomId));
      if (lastId) {
        await tx
          .update(chatRoomMembersTable)
          .set({ lastReadMessageId: lastId })
          .where(eq(chatRoomMembersTable.roomId, roomId));
      }
      await tx
        .update(battleSessionsTable)
        .set({ state, status: state.phase })
        .where(eq(battleSessionsTable.roomId, roomId));
    });
    if (state.ended) await recordBattleResultStats(state, log);
    log.info({ roomId, turnIndex }, "Battle turn auto-forfeited (timeout)");
    return true;
  });
}

// Rooms with an AI turn currently being generated, so concurrent pollers don't
// pile up duplicate OpenAI calls (the lock guarantees correctness; this avoids waste).
const aiTurnInFlight = new Set<string>();

/**
 * If the current speaker is an AI persona, generate its utterance in character,
 * have the judge score it (same as a human), post both, and advance the turn.
 * Safe to call repeatedly (from polls / after submits): an in-flight guard plus
 * the room lock + turn re-check make double-triggers no-ops. Returns true if it
 * resolved an AI turn.
 */
export async function resolveAITurn(roomId: string, log: Logger): Promise<boolean> {
  const [peek] = await db
    .select()
    .from(battleSessionsTable)
    .where(eq(battleSessionsTable.roomId, roomId));
  if (!peek || peek.state.phase !== "active") return false;
  if (!currentSpeakerIsAI(peek.state)) return false;
  if (aiTurnInFlight.has(roomId)) return false;

  aiTurnInFlight.add(roomId);
  try {
    return await withLock(roomId, async () => {
      const [session] = await db
        .select()
        .from(battleSessionsTable)
        .where(eq(battleSessionsTable.roomId, roomId));
      if (!session || session.state.phase !== "active") return false;
      const state = session.state;
      if (!currentSpeakerIsAI(state)) return false; // someone/something advanced it already

      const speaker = state.participants.find((p) => p.userId === state.currentSpeakerUserId);
      if (!speaker?.isAI || !speaker.personaId) return false;
      const persona = getPersona(speaker.personaId);
      if (!persona) return false;

      const side = speaker.side ?? "";
      const round = roundOf(state.turnIndex);
      const turnIndex = state.turnIndex;

      // Build a short transcript from prior turns so the AI can rebut.
      const prior = await db
        .select({
          turnIndex: battleTurnsTable.turnIndex,
          side: battleTurnsTable.side,
          content: battleTurnsTable.content,
        })
        .from(battleTurnsTable)
        .where(eq(battleTurnsTable.roomId, roomId));
      const transcript = prior
        .filter((t) => t.content.trim())
        .sort((a, b) => a.turnIndex - b.turnIndex)
        .slice(-4)
        .map((t) => `[${t.side === "pro" ? "찬성" : t.side === "con" ? "반대" : "?"}] ${t.content}`)
        .join("\n");

      const utterance = await generateAIUtterance(
        { persona, topic: state.topic, side, round, transcript },
        log,
      );
      const evaluation = await evaluateUtterance(
        { topic: state.topic, side, round, content: utterance },
        log,
      );
      speaker.totalScore += evaluation.total;

      const judgeId = await getOrCreateJudgeUser();
      const sideLabel = side === "pro" ? "찬성" : side === "con" ? "반대" : "";
      const evalLine = evaluation.violation
        ? `⚖️ ${speaker.name}(${sideLabel}) 평가 — ⚠️ 부적절한 표현으로 0점\n${evaluation.feedback}`
        : `⚖️ ${speaker.name}(${sideLabel}) 평가 — 논리 ${evaluation.logic} · 설득 ${evaluation.persuasiveness} · 반박 ${evaluation.rebuttal} · 재치 ${evaluation.wit} · 예의 ${evaluation.manners} = ${evaluation.total}점\n${evaluation.feedback}`;

      const advanceLines = advanceTurn(state);

      await db.transaction(async (tx) => {
        const base = Date.now();
        // The AI's utterance bubble (sent as the persona bot user).
        await tx.insert(messagesTable).values({
          roomId,
          senderId: speaker.userId,
          type: "text",
          content: utterance,
          createdAt: new Date(base),
        });
        await tx.insert(battleTurnsTable).values({
          roomId,
          round,
          turnIndex,
          speakerId: speaker.userId,
          side,
          content: utterance,
          evaluation,
        });
        const lastId = await postSystemLines(
          tx as unknown as typeof db,
          roomId,
          judgeId,
          [evalLine, ...advanceLines],
          base + 1,
        );
        await tx
          .update(chatRoomsTable)
          .set({ lastMessage: `${speaker.name} ${evaluation.total}점`, lastMessageAt: new Date() })
          .where(eq(chatRoomsTable.id, roomId));
        if (lastId) {
          await tx
            .update(chatRoomMembersTable)
            .set({ lastReadMessageId: lastId })
            .where(eq(chatRoomMembersTable.roomId, roomId));
        }
        await tx
          .update(battleSessionsTable)
          .set({ state, status: state.phase })
          .where(eq(battleSessionsTable.roomId, roomId));
      });
      if (state.ended) await recordBattleResultStats(state, log);
      log.info({ roomId, turnIndex, personaId: persona.id }, "Battle AI turn resolved");
      return true;
    });
  } finally {
    aiTurnInFlight.delete(roomId);
  }
}

interface ReadyResult {
  ok: boolean;
  error?: string;
  state?: BattleState;
  bothReady?: boolean;
}

/**
 * Mark a participant ready. Serialized under the room lock so two players
 * readying at once can't lose-update each other's flag. Returns whether both
 * are now ready (caller fires the game start).
 */
export async function markBattleReady(roomId: string, userId: string): Promise<ReadyResult> {
  return withLock(roomId, async () => {
    const [session] = await db
      .select()
      .from(battleSessionsTable)
      .where(eq(battleSessionsTable.roomId, roomId));
    if (!session) return { ok: false, error: "Not a battle" };
    const state = session.state;
    if (state.phase !== "waiting") {
      return { ok: true, state, bothReady: false };
    }
    const me = state.participants.find((p) => p.userId === userId);
    if (me) me.ready = true;
    await db
      .update(battleSessionsTable)
      .set({ state })
      .where(eq(battleSessionsTable.roomId, roomId));
    const bothReady =
      state.participants.length >= 2 && state.participants.every((p) => p.ready);
    return { ok: true, state, bothReady };
  });
}

/**
 * Reset a finished battle back to the waiting room. Locked + guarded to
 * `phase==="ended"` so it can't race with an in-progress submission/timeout.
 */
export async function restartBattle(roomId: string): Promise<SubmitResult> {
  return withLock(roomId, async () => {
    const [session] = await db
      .select()
      .from(battleSessionsTable)
      .where(eq(battleSessionsTable.roomId, roomId));
    if (!session) return { ok: false, error: "Not a battle" };
    const prev = session.state;
    if (prev.phase !== "ended") {
      return { ok: false, error: "Battle is not finished" };
    }
    // AI battles never use the 준비 step, so a rematch must reset everyone ready
    // (the human has no ready button) — the route then auto-starts it.
    const hasAI = prev.participants.some((p) => p.isAI);
    const reset: BattleState = {
      ...prev,
      startQuestion: "",
      phase: "waiting",
      participants: prev.participants.map((p) => ({
        ...p,
        side: "" as const,
        totalScore: 0,
        ready: hasAI ? true : false,
      })),
      order: [],
      turnIndex: -1,
      currentSpeakerUserId: null,
      turnStartedAt: null,
      ended: false,
      winnerUserId: null,
    };
    await db
      .update(battleSessionsTable)
      .set({ state: reset, status: "waiting" })
      .where(eq(battleSessionsTable.roomId, roomId));
    return { ok: true, state: reset };
  });
}

export interface CancelResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * Cancel a battle that's still in the waiting room and delete its room (cascades
 * to the session, members, messages, and turns). Only the host may cancel, and
 * only before the game has started. Run under the room lock so it can't race with
 * a ready/start that's flipping the battle to active.
 */
export async function cancelBattle(roomId: string, userId: string): Promise<CancelResult> {
  return withLock(roomId, async () => {
    const [room] = await db
      .select({ ownerId: chatRoomsTable.ownerId, type: chatRoomsTable.type })
      .from(chatRoomsTable)
      .where(eq(chatRoomsTable.id, roomId));
    if (!room || room.type !== "battle") {
      return { ok: false, status: 404, error: "Not a battle" };
    }
    if (room.ownerId !== userId) {
      return { ok: false, status: 403, error: "신청자만 취소할 수 있습니다" };
    }
    const [session] = await db
      .select({ state: battleSessionsTable.state })
      .from(battleSessionsTable)
      .where(eq(battleSessionsTable.roomId, roomId));
    if (session && session.state.phase !== "waiting") {
      return { ok: false, status: 409, error: "이미 시작된 배틀은 취소할 수 없습니다" };
    }
    // onDelete: cascade on session/members/messages/turns cleans everything up.
    await db.delete(chatRoomsTable).where(eq(chatRoomsTable.id, roomId));
    return { ok: true };
  });
}
