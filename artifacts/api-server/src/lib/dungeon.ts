import { desc, eq, inArray } from "drizzle-orm";
import type { Logger } from "pino";
import { db } from "@workspace/db";
import {
  chatRoomMembersTable,
  chatRoomsTable,
  dungeonSessionsTable,
  messagesTable,
  usersTable,
  type DungeonCharacter,
  type DungeonEnemy,
  type DungeonEvent,
  type DungeonEventKind,
  type DungeonGoal,
  type DungeonState,
} from "@workspace/db";
import { getOpenAI } from "./aiClient";
import { sendPushToUsers } from "./push";
import { recordActivity } from "./growth";

const DM_EMAIL = "dungeon-master@todotalk.system";
const DM_CLERK_ID = "system:dungeon-master";
export const DM_NICKNAME = "던전 마스터";

const DUNGEON_MODEL = "gpt-5-mini";

// Default starting character stats for a new party member.
export const START_HP = 20;
export const START_INVENTORY = ["낡은 단검", "체력 물약"];

let cachedDmUserId: string | null = null;

/** Get (or lazily create) the system "Dungeon Master" bot user id. */
export async function getOrCreateDmUser(): Promise<string> {
  if (cachedDmUserId) return cachedDmUserId;
  await db
    .insert(usersTable)
    .values({
      clerkId: DM_CLERK_ID,
      email: DM_EMAIL,
      nickname: DM_NICKNAME,
      statusMessage: "🎲 던전을 안내하는 AI 게임 마스터",
      notificationEnabled: false,
    })
    .onConflictDoNothing({ target: usersTable.email });
  const [u] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, DM_EMAIL));
  cachedDmUserId = u.id;
  return u.id;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function buildSystemPrompt(): string {
  return [
    "당신은 정통 판타지 세계를 무대로 한 텍스트 머드(MUD) 게임의 '던전 마스터(DM)'입니다.",
    "여러 명의 플레이어가 하나의 파티로 같은 던전을 함께 탐험합니다(협동 플레이).",
    "반드시 한국어로만 답하세요.",
    "검과 마법, 고블린·오크·슬라임 같은 몬스터, 함정, 보물, 수수께끼가 등장하는 고전 판타지 분위기를 유지하세요.",
    "내러티브(narrative)는 생생하지만 간결하게 2~5문장으로 쓰고, 현재 상황 묘사로 자연스럽게 끝내세요. '이제 어떻게 하시겠습니까?', '무엇을 할 것인가?', '어떻게 할 것인가?', '당신의 선택은?' 같이 플레이어에게 행동을 되묻는 상투적인 마무리 문구는 절대 붙이지 마세요. 행동 선택지는 choices 필드로 따로 제시되므로 내러티브에서 반복하지 마세요.",
    "플레이어의 행동에 공정하게 반응하고, 가끔 운(성공/실패), 위험, 보상을 부여하세요.",
    "전투/사건에 따라 HP를 깎거나 회복시키고, 아이템 획득·사용을 인벤토리에 반영하세요.",
    "특정 플레이어를 지목할 때는 그 사람의 이름을 사용하세요.",
    "party 배열에는 반드시 현재 모든 파티원을 포함하고, 각 파티원의 userId를 그대로 유지하세요. maxHp는 변경하지 마세요.",
    "파티 전원의 hp가 0이 되면(전멸) ended=true, 메인 목표를 달성하면 ended=true로 표시하세요.",
    "",
    "## 미션 목표 (goals)",
    "각 던전에는 분명한 미션이 있어야 재미있습니다. goals 배열로 관리하세요.",
    "- 메인 목표(kind='main')는 정확히 1개. 이 던전의 승리 조건입니다. 다음 세 유형 중 하나로 명확하게 정하세요: (가)몬스터 처치(예: '동굴의 주인 마룡 그라쉬를 쓰러뜨린다'), (나)수집(예: '봉인된 성배 조각 3개를 모두 회수한다'), (다)단서/수수께끼 해결(예: '사라진 영주의 행방을 밝혀낸다').",
    "- 서브 목표(kind='sub')는 1~3개. 메인으로 가는 중간 단계입니다(예: '지하 묘지의 녹슨 열쇠를 찾는다').",
    "- 매 턴 goals 배열 전체를 다시 반환하세요. 이미 정한 목표의 text는 절대 바꾸지 말고, 달성된 목표만 done=true로 바꾸세요. 새 서브 목표가 자연스럽게 생기면 추가할 수 있습니다.",
    "- 메인 목표가 done=true가 되면 반드시 ended=true로 모험을 끝내고, 승리를 축하하는 에필로그를 narrative에 쓰세요.",
    "",
    "## 선택지 품질 (choices) — 매우 중요",
    "- choices에는 '현명한 선택'과 '위험하거나 어리석은 선택'이 섞여 있어야 합니다. 모든 선택이 똑같이 좋아서는 안 됩니다.",
    "- 단, 순전히 운으로 찍는 도박이 되면 안 됩니다. 직전 내러티브에 어느 선택이 더 나은지 추론할 단서(위험 신호, 함정의 징후, 유리한 지형, 적의 약점 등)를 반드시 깔아 두세요. 주의 깊게 읽은 플레이어가 더 나은 선택을 할 수 있어야 합니다.",
    "- 선택지에 '(안전)', '(위험)' 같은 정답 표시를 붙이지 마세요. 몰입을 해칩니다.",
    "",
    "## 선택의 결과와 게임 포인트 (score)",
    "- 매 턴 narrative의 첫머리에서 플레이어가 '직전에 선택한 행동의 결과'를 분명히 알려주세요. 성공/실패, 이득/손해를 구체적으로 묘사해 긴장감을 주세요.",
    "- 그 결과에 따라 게임 포인트를 부여하세요. 현명하고 성공적인 선택은 +점수, 위험하거나 실패한 선택은 −점수.",
    "- 점수 변화는 events 배열에 kind='score' 이벤트로 넣고, points 필드에 정수 증감값을 넣으세요(획득=양수, 차감=음수). text에는 짧은 평가를 쓰세요(예: '기지를 발휘했다! +15점', '함정에 걸려들었다. −10점'). 점수 변화가 없는 평범한 턴이면 score 이벤트는 넣지 않아도 됩니다.",
    "- 점수 규모는 보통 5~25점 사이로, 중대한 성공/실패는 더 크게 주세요.",
    "",
    "## 추가 출력 규칙",
    "enemies: 현재 전투 중인 몬스터들의 목록입니다. 전투 중이 아니면 빈 배열로 두세요. 몬스터가 등장하면 추가하고, 처치되면 제거하며, 피해를 입으면 hp를 갱신하세요. maxHp는 첫 등장 시 정하고 이후 유지하세요.",
    "choices: 플레이어가 지금 할 수 있는 행동 선택지를 2~4개 제시하세요. 각 항목은 단순 명령어가 아니라, 방금 내러티브 상황과 자연스럽게 이어지는 몰입형 1인칭 대사·행동 문장이어야 합니다. 플레이어가 탭하면 그 문장이 그대로 본인의 발화로 채팅에 올라가므로, 그 자체로 멋지게 읽히도록 생생하게 쓰세요(예: '나는 검을 뽑아 들고 \"덤벼라!\" 외치며 고블린 무리로 돌진한다', '나는 숨을 죽인 채 벽을 따라 조용히 뒤로 물러난다'). 한 문장(최대 두 문장)으로 간결하게. 게임이 끝났으면(ended=true) 빈 배열로 두세요.",
    "events: 이번 턴에 일어난 '상태 변화'를 짧은 시스템 알림 문구로 나열하세요. 종류(kind)는 다음 중 하나입니다:",
    "  - spawn: 몬스터 출현 (예: '고블린 무리가 나타났다!')",
    "  - playerHit: 파티원이 피해를 입음. 이때 반드시 그 파티원의 userId를 targetUserId에 넣으세요. (예: '철수가 7의 피해를 입었다')",
    "  - enemyHit: 몬스터가 피해를 입음 (예: '고블린에게 5의 피해를 입혔다')",
    "  - heal: 회복. 파티원이 대상이면 targetUserId를 넣으세요. (예: '영희가 6 회복했다')",
    "  - loot: 아이템/보물 획득 (예: '낡은 열쇠를 발견했다')",
    "  - death: 사망/처치 (예: '고블린이 쓰러졌다', '철수가 쓰러졌다')",
    "  - score: 게임 포인트 변동. points 필드에 정수 증감값을 넣으세요. (예: '기지를 발휘했다! +15점')",
    "  - info: 기타 중요한 상태 변화 (예: '함정이 발동했다')",
    "변화가 없는 평범한 탐험 턴이라면 events는 빈 배열이어도 됩니다. text는 각각 한 문장으로 간결하게 쓰세요.",
  ].join("\n");
}

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["narrative", "scene", "party", "enemies", "goals", "choices", "events", "ended"],
  properties: {
    narrative: { type: "string", description: "플레이어에게 보여줄 DM의 한국어 서술" },
    scene: { type: "string", description: "현재 위치/상황 요약(짧게)" },
    ended: { type: "boolean" },
    goals: {
      type: "array",
      description: "미션 목표 목록. 메인(kind='main') 1개 + 서브(kind='sub') 1~3개. 매 턴 전체를 반환하고 달성된 것만 done=true로.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "kind", "done"],
        properties: {
          text: { type: "string" },
          kind: { type: "string", enum: ["main", "sub"] },
          done: { type: "boolean" },
        },
      },
    },
    party: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["userId", "name", "hp", "maxHp", "status", "inventory"],
        properties: {
          userId: { type: "string" },
          name: { type: "string" },
          hp: { type: "integer" },
          maxHp: { type: "integer" },
          status: { type: "string" },
          inventory: { type: "array", items: { type: "string" } },
        },
      },
    },
    enemies: {
      type: "array",
      description: "현재 전투 중인 몬스터 목록(없으면 빈 배열)",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "hp", "maxHp"],
        properties: {
          name: { type: "string" },
          hp: { type: "integer" },
          maxHp: { type: "integer" },
        },
      },
    },
    choices: {
      type: "array",
      description: "플레이어가 지금 할 수 있는 행동 선택지(2~4개). 내러티브와 이어지는 몰입형 1인칭 대사/행동 문장.",
      items: { type: "string" },
    },
    events: {
      type: "array",
      description: "이번 턴의 상태 변화 시스템 알림",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text", "targetUserId", "points"],
        properties: {
          kind: {
            type: "string",
            enum: ["spawn", "playerHit", "enemyHit", "heal", "loot", "death", "score", "info"],
          },
          text: { type: "string" },
          targetUserId: {
            type: ["string", "null"],
            description: "playerHit/heal일 때 해당 파티원의 userId, 아니면 null",
          },
          points: {
            type: ["integer", "null"],
            description: "score일 때 획득(+)/차감(−) 점수, 아니면 null",
          },
        },
      },
    },
  },
} as const;

interface DmEnemyUpdate {
  name: string;
  hp: number;
  maxHp: number;
}

interface DmEventUpdate {
  kind: DungeonEventKind;
  text: string;
  targetUserId: string | null;
  points: number | null;
}

interface DmGoalUpdate {
  text: string;
  kind: "main" | "sub";
  done: boolean;
}

interface DmTurnResult {
  narrative: string;
  scene: string;
  ended: boolean;
  party: DungeonCharacter[];
  enemies: DmEnemyUpdate[];
  goals: DmGoalUpdate[];
  choices: string[];
  events: DmEventUpdate[];
}

const EVENT_KINDS: ReadonlySet<string> = new Set([
  "spawn",
  "playerHit",
  "enemyHit",
  "heal",
  "loot",
  "death",
  "score",
  "info",
]);

// --- Per-room in-process turn serialization -------------------------------
// A dungeon turn reads game state, calls the AI (several seconds), then writes
// the result back. Running two turns for the same room concurrently would let
// them clobber each other's state, so we chain turns per room in memory. The
// api-server runs as a single instance, so an in-memory lock is sufficient.
const roomLocks = new Map<string, Promise<unknown>>();

function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const prev = roomLocks.get(roomId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  roomLocks.set(roomId, next);
  void next.finally(() => {
    if (roomLocks.get(roomId) === next) roomLocks.delete(roomId);
  });
  return next;
}

// --- Per-room rate limiting -----------------------------------------------
// Each AI turn costs Replit credits, so we throttle how often a room can
// trigger the DM. A turn started within COOLDOWN_MS of the last one is dropped.
const COOLDOWN_MS = 2500;
const MAX_ACTION_CHARS = 1000;
const lastTurnAt = new Map<string, number>();

/**
 * Run a single dungeon turn for a room: load state, ask the AI Dungeon Master
 * to narrate and update party state, then persist the narration as a message
 * from the DM bot and save the new game state. Safe to call fire-and-forget.
 */
export async function runDungeonTurn(
  roomId: string,
  action: { userId: string; name: string; text: string } | null,
  log: Logger,
): Promise<void> {
  // Drop player-driven turns that arrive too soon after the previous one to
  // avoid runaway AI cost. The opening turn (action === null) is never throttled.
  if (action) {
    const last = lastTurnAt.get(roomId) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) {
      log.info({ roomId }, "Dungeon turn throttled (cooldown)");
      return;
    }
    if (action.text.length > MAX_ACTION_CHARS) {
      action = { ...action, text: action.text.slice(0, MAX_ACTION_CHARS) };
    }
  }
  lastTurnAt.set(roomId, Date.now());

  await withRoomLock(roomId, async () => {
    const [session] = await db
      .select()
      .from(dungeonSessionsTable)
      .where(eq(dungeonSessionsTable.roomId, roomId));
    if (!session || session.status !== "active" || session.state.ended) return;

    const state = session.state;
    const dmUserId = await getOrCreateDmUser();

    // Recent text history (chronological) for context.
    const recentDesc = await db
      .select({ senderId: messagesTable.senderId, type: messagesTable.type, content: messagesTable.content })
      .from(messagesTable)
      .where(eq(messagesTable.roomId, roomId))
      .orderBy(desc(messagesTable.createdAt))
      .limit(16);
    const recent = recentDesc.reverse();

    const nameById = new Map<string, string>(state.party.map((p) => [p.userId, p.name]));
    const historyLines = recent
      .filter((m) => m.type === "text")
      .map((m) => {
        const who = m.senderId === dmUserId ? "DM" : nameById.get(m.senderId) ?? "모험가";
        return `${who}: ${m.content}`;
      });

    const openingInstruction = [
      "(게임 시작) 이번이 이 파티의 첫 장면입니다. 웹소설 프롤로그처럼 몰입감 있는 도입부를 작성하세요:",
      `- 테마는 '${session.theme}'입니다. 이 세계와 던전에 얽힌 배경(전설, 소문, 닥쳐온 위협 등)을 한두 문장으로 제시하세요.`,
      "- 이 던전의 미션을 정하세요: goals 배열에 메인 목표(kind='main') 1개와 서브 목표(kind='sub') 1~3개를 담으세요. 메인 목표는 명확한 승리 조건(몬스터 처치/수집/단서 해결 중 하나)이어야 합니다. 처음에는 모두 done=false.",
      "- 도입부 narrative에서 파티에게 이 미션(무엇을 왜 하러 왔는지, 메인 목표)을 자연스럽게 알려주세요.",
      "- 그런 다음 파티가 막 도착한 첫 장면을 생생하게 묘사하고, 첫 선택지를 제시하세요. 첫 선택지에도 현명한 선택과 위험한 선택을 섞되, 단서를 깔아 두세요.",
      "- party 배열의 이름을 직접 언급해 인물에 생명을 불어넣으세요.",
      "- 첫 턴에는 보통 score 이벤트가 필요 없습니다(아직 선택한 행동이 없으므로).",
      "도입부(narrative)는 분위기를 잡기 위해 평소보다 길어도 됩니다(최대 8문장).",
    ].join("\n");

    const userContent = [
      "## 현재 게임 상태",
      JSON.stringify(
        {
          theme: session.theme,
          scene: state.scene,
          turn: state.turn,
          points: state.points ?? 0,
          goals: state.goals ?? [],
          party: state.party,
          enemies: state.enemies ?? [],
        },
        null,
        2,
      ),
      "",
      "## 최근 기록",
      historyLines.length > 0 ? historyLines.join("\n") : "(아직 없음)",
      "",
      "## 이번 진행",
      action ? `플레이어 "${action.name}"의 행동: ${action.text}` : openingInstruction,
    ].join("\n");

    let result: DmTurnResult | null = null;
    try {
      const completion = await getOpenAI().chat.completions.create({
        model: DUNGEON_MODEL,
        // gpt-5-mini is a reasoning model: reasoning tokens count against
        // max_completion_tokens. Combat turns emit a large JSON payload
        // (narrative + party + several enemies + choices + events); 2000 was too
        // low, so reasoning + output overran the budget, the response was
        // truncated (finish_reason "length"), and JSON.parse failed → the
        // "던전 마스터가 답하지 못했습니다" fallback. Give ample headroom.
        max_completion_tokens: 6000,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: userContent },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "dungeon_turn", strict: true, schema: responseSchema },
        },
      });
      const choice = completion.choices[0];
      const raw = choice?.message?.content;
      const finishReason = choice?.finish_reason;
      const usage = completion.usage;
      if (!raw) {
        // No content usually means the turn was truncated before any JSON was
        // emitted — log finish_reason + token usage so we can tell a budget
        // overrun apart from a content filter or upstream error.
        log.error({ roomId, finishReason, usage }, "Dungeon AI returned empty content");
      } else {
        try {
          result = JSON.parse(raw) as DmTurnResult;
        } catch (parseErr) {
          // Present-but-unparseable content is the classic truncation signature
          // (finishReason "length"); keep usage + length to confirm the cause.
          log.error(
            { err: parseErr, roomId, finishReason, usage, rawLength: raw.length },
            "Dungeon AI returned unparseable JSON (likely truncated)",
          );
        }
      }
    } catch (err) {
      log.error({ err, roomId }, "Dungeon AI turn failed");
    }

    // Merge AI party updates into existing party (by userId). Unknown ids are
    // ignored; maxHp stays fixed to prevent drift.
    let narrative: string;
    let nextEnded = state.ended;
    let nextScene = state.scene;
    let nextEnemies: DungeonEnemy[] = state.enemies ?? [];
    let nextChoices: string[] = state.choices ?? [];
    let nextEvents: DungeonEvent[] = [];
    let nextGoals: DungeonGoal[] = state.goals ?? [];
    let nextPoints: number = state.points ?? 0;
    const byId = new Map(state.party.map((p) => [p.userId, { ...p }]));
    const validIds = new Set(state.party.map((p) => p.userId));

    if (result) {
      narrative = result.narrative?.trim() || "...";
      nextScene = result.scene?.trim() || state.scene;
      for (const upd of result.party ?? []) {
        const base = byId.get(upd.userId);
        if (!base) continue;
        base.hp = clamp(Math.round(Number(upd.hp ?? base.hp)), 0, base.maxHp);
        if (typeof upd.status === "string" && upd.status.trim()) base.status = upd.status.trim();
        if (Array.isArray(upd.inventory)) base.inventory = upd.inventory.slice(0, 30).map(String);
      }
      const newParty = Array.from(byId.values());
      const allDead = newParty.length > 0 && newParty.every((p) => p.hp <= 0);

      // Sanitize goals: keep non-empty text, normalize kind, ensure exactly one
      // main. If the AI returns nothing, keep the previous goals so an off-turn
      // omission never wipes the mission mid-run.
      const sanitizedGoals: DungeonGoal[] = (result.goals ?? [])
        .filter((g) => g && typeof g.text === "string" && g.text.trim())
        .slice(0, 6)
        .map((g) => ({
          text: g.text.trim().slice(0, 120),
          kind: g.kind === "main" ? "main" : "sub",
          done: !!g.done,
        }));
      if (sanitizedGoals.length > 0) {
        // Force a single main goal: keep the first main, demote any extras.
        let sawMain = false;
        for (const g of sanitizedGoals) {
          if (g.kind === "main") {
            if (sawMain) g.kind = "sub";
            else sawMain = true;
          }
        }
        // If none was marked main, promote the first goal so a win condition exists.
        if (!sawMain) sanitizedGoals[0].kind = "main";
        nextGoals = sanitizedGoals;
      }
      // Guarantee a win condition: on the opening turn (no player action yet), if
      // the model gave no usable main goal, inject a fallback. Without this the
      // "main goal done => game ends" path could be permanently disabled.
      if (!action && !nextGoals.some((g) => g.kind === "main")) {
        nextGoals = [
          { text: `${session.theme}의 핵심 위협을 물리치고 던전을 정복한다`, kind: "main", done: false },
          ...nextGoals.filter((g) => g.kind === "sub").slice(0, 3),
        ];
      }
      const mainGoalDone = nextGoals.some((g) => g.kind === "main" && g.done);
      nextEnded = !!result.ended || allDead || mainGoalDone;

      // Sanitize enemies: keep named monsters with valid hp, fixed maxHp.
      nextEnemies = (result.enemies ?? [])
        .filter((e) => e && typeof e.name === "string" && e.name.trim())
        .slice(0, 8)
        .map((e) => {
          const maxHp = Math.max(1, Math.round(Number(e.maxHp ?? e.hp ?? 1)));
          return {
            name: e.name.trim().slice(0, 40),
            maxHp,
            hp: clamp(Math.round(Number(e.hp ?? maxHp)), 0, maxHp),
          };
        });

      // Choices are cleared once the adventure ends.
      nextChoices = nextEnded
        ? []
        : (result.choices ?? [])
            .filter((c) => typeof c === "string" && c.trim())
            .slice(0, 4)
            .map((c) => c.trim().slice(0, 120));
      // The dungeon UI has no free-text input — players act only via choice
      // buttons — so a non-ended turn MUST expose at least one action, or the
      // game soft-locks. If the AI returned none, inject safe defaults.
      if (!nextEnded && nextChoices.length === 0) {
        nextChoices = ["주변을 살핀다", "조심스럽게 앞으로 나아간다", "방어 태세를 취한다"];
      }

      // Sanitize events; drop targetUserId that isn't a real party member.
      nextEvents = (result.events ?? [])
        .filter((e) => e && typeof e.text === "string" && e.text.trim())
        .slice(0, 6)
        .map((e) => {
          const kind: DungeonEventKind = EVENT_KINDS.has(e.kind) ? e.kind : "info";
          const target =
            typeof e.targetUserId === "string" && validIds.has(e.targetUserId)
              ? e.targetUserId
              : undefined;
          const ev: DungeonEvent = { kind, text: e.text.trim().slice(0, 200) };
          if (target) ev.targetUserId = target;
          // Score events carry a signed point delta (clamped to a sane range).
          if (kind === "score" && typeof e.points === "number" && Number.isFinite(e.points)) {
            ev.points = clamp(Math.round(e.points), -100, 100);
          }
          return ev;
        });

      // Running score total = previous + sum of this turn's score deltas.
      const pointsDelta = nextEvents.reduce(
        (sum, e) => sum + (e.kind === "score" ? e.points ?? 0 : 0),
        0,
      );
      nextPoints = (state.points ?? 0) + pointsDelta;
    } else {
      narrative = action
        ? "음... 던전 마스터가 잠시 답하지 못했습니다. 다시 행동을 선택해 주세요."
        : "던전 마스터가 던전을 준비하는 데 실패했습니다. 잠시 후 다시 시도해 주세요.";
    }

    const newParty = Array.from(byId.values());

    // Persist the DM narration, room metadata, read state, and (when the AI
    // succeeded) the next game state atomically so we never leave a saved DM
    // message paired with stale dungeon state.
    await db.transaction(async (tx) => {
      // Order matters for the client's sequential reveal: system notices land
      // first (당~ 당~ 당~), then the DM narration bubble. UUID ids carry no
      // ordering, and all rows in a transaction share now(), so we stamp
      // explicit, strictly-increasing createdAt values to pin the order.
      const base = Date.now();
      let lastMsgId: string | undefined;

      // Each state-change event becomes a centered "system" line in the chat
      // flow (rendered differently from bubbles on the client).
      for (let i = 0; i < nextEvents.length; i++) {
        const [sysMsg] = await tx
          .insert(messagesTable)
          .values({
            roomId,
            senderId: dmUserId,
            type: "system",
            content: nextEvents[i].text,
            createdAt: new Date(base + i),
          })
          .returning();
        lastMsgId = sysMsg.id;
      }

      const [msg] = await tx
        .insert(messagesTable)
        .values({
          roomId,
          senderId: dmUserId,
          type: "text",
          content: narrative,
          createdAt: new Date(base + nextEvents.length),
        })
        .returning();
      lastMsgId = msg.id;

      await tx
        .update(chatRoomsTable)
        .set({ lastMessage: narrative.length > 80 ? `${narrative.slice(0, 80)}…` : narrative, lastMessageAt: new Date() })
        .where(eq(chatRoomsTable.id, roomId));

      // A DM message resurfaces the dungeon for anyone who hid it.
      await tx
        .update(chatRoomMembersTable)
        .set({ hiddenAt: null })
        .where(eq(chatRoomMembersTable.roomId, roomId));

      // The DM bot has implicitly "read" up to its last message this turn.
      await tx
        .update(chatRoomMembersTable)
        .set({ lastReadMessageId: lastMsgId })
        .where(eq(chatRoomMembersTable.roomId, roomId));

      if (result) {
        const nextState: DungeonState = {
          scene: nextScene,
          party: newParty,
          enemies: nextEnemies,
          goals: nextGoals,
          points: nextPoints,
          turn: state.turn + 1,
          ended: nextEnded,
          choices: nextChoices,
          lastTurnEvents: nextEvents,
          lastNarrativeMessageId: msg.id,
        };
        await tx
          .update(dungeonSessionsTable)
          .set({ state: nextState, status: nextEnded ? "ended" : "active" })
          .where(eq(dungeonSessionsTable.roomId, roomId));
      }
    });

    // Grow the acting player's persona (self-isolated). Only player-driven turns
    // (action != null) count; the AI-generated opening scene does not.
    if (result && action) {
      void recordActivity({
        userId: action.userId,
        kind: "dungeon_action",
        sourceId: roomId,
        sourceKey: `dungeon_action:${roomId}:${state.turn}:${action.userId}`,
        log,
      });

      // Award goal growth when goals flip from not-done to done this turn. The
      // acting player gets credit for advancing the party's mission. The goal
      // text is part of the sourceKey so each goal is rewarded at most once.
      const prevDone = (state.goals ?? []).filter((g) => g.done).map((g) => g.text);
      const prevDoneSet = new Set(prevDone);
      const newlyDone = nextGoals.filter((g) => g.done && !prevDoneSet.has(g.text));
      for (const goal of newlyDone) {
        void recordActivity({
          userId: action.userId,
          kind: "dungeon_goal",
          sourceId: roomId,
          sourceKey: `dungeon_result:${roomId}:${action.userId}:${goal.text}`,
          metadata: { goal: goal.text },
          log,
        });
      }
    }

    // Notify human players of the DM's move (fire-and-forget).
    try {
      const members = await db
        .select({ userId: chatRoomMembersTable.userId })
        .from(chatRoomMembersTable)
        .where(eq(chatRoomMembersTable.roomId, roomId));
      const recipients = members.map((m) => m.userId).filter((id) => id !== dmUserId);
      if (recipients.length > 0) {
        await sendPushToUsers(recipients, {
          title: `🎲 ${DM_NICKNAME}`,
          body: narrative.length > 80 ? `${narrative.slice(0, 80)}…` : narrative,
          url: `/chat/${roomId}`,
          tag: `room-${roomId}`,
        });
      }
    } catch (err) {
      log.error({ err, roomId }, "Failed to dispatch dungeon push");
    }
  });
}

/** Build the initial party for a list of human player ids. */
export async function buildInitialParty(humanIds: string[]): Promise<DungeonCharacter[]> {
  const users =
    humanIds.length > 0
      ? await db.select().from(usersTable).where(inArray(usersTable.id, humanIds))
      : [];
  return humanIds.map((uid) => {
    const u = users.find((x) => x.id === uid);
    return {
      userId: uid,
      name: u?.nickname ?? "모험가",
      hp: START_HP,
      maxHp: START_HP,
      status: "건강함",
      inventory: [...START_INVENTORY],
    };
  });
}
