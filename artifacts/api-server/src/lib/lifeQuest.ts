import type { Logger } from "pino";
import {
  LIFE_QUEST_THEMES,
  type LifeQuestChoice,
  type LifeQuestRiskLevel,
  type LifeQuestStage,
  type LifeQuestTheme,
  type PersonaStats,
} from "@workspace/db";
import { getOpenAI } from "./aiClient";

const LIFE_QUEST_MODEL = "gpt-5-mini";

/** The seven persona stats a Life Quest choice may move. */
const STAT_KEYS: (keyof PersonaStats)[] = [
  "logic",
  "empathy",
  "wit",
  "knowledge",
  "conviction",
  "emotion",
  "decisiveness",
];

const RISK_LEVELS: LifeQuestRiskLevel[] = ["low", "medium", "high"];

/** Korean labels for each theme — used in the prompt and as a UI fallback. */
export const LIFE_QUEST_THEME_LABELS: Record<LifeQuestTheme, string> = {
  work: "직장·업무",
  relationship: "인간관계",
  money: "돈 관리",
  health: "생활 습관",
  study: "공부·자기계발",
  conflict: "갈등 해결",
  startup: "창업·사이드 프로젝트",
  daily: "일상 선택",
};

/** A theme-specific seed so generated scenarios stay grounded in everyday life. */
const THEME_HINTS: Record<LifeQuestTheme, string> = {
  work: "직장에서의 협업, 마감, 상사·동료와의 커뮤니케이션, 업무 우선순위 같은 평범한 직장 생활 상황.",
  relationship: "친구·연인·가족과의 약속, 오해, 부탁, 거리 조절 같은 일상적인 인간관계 상황.",
  money: "용돈·월급 관리, 소비와 절약, 구독 정리, 친구와의 더치페이 같은 생활 속 돈 관리 상황. (구체적 투자 종목·재테크 조언은 금지)",
  health: "수면·운동·식사·휴식 루틴을 만드는 평범한 생활 습관 상황. (의학적 진단·치료 조언은 금지)",
  study: "시험 준비, 새 기술 배우기, 집중력 관리, 강의 듣기 같은 공부·자기계발 상황.",
  conflict: "오해나 의견 충돌을 대화로 풀어가는 평범한 갈등 해결 상황. (폭력·법적 분쟁은 금지)",
  startup: "사이드 프로젝트·작은 가게·팀 운영의 결정 같은 현실적인 창업 상황. (구체적 법률·세무·투자 조언은 금지)",
  daily: "주말 계획, 미루던 일 처리, 새로운 시도 같은 소소한 일상 선택 상황.",
};

/** The raw shape the model returns (ids/risk normalization happens after). */
interface GeneratedChoice {
  label: string;
  description: string;
  resultText: string;
  statChanges: Record<string, number>;
  riskLevel: string;
}
interface GeneratedStage {
  title: string;
  situation: string;
  choices: GeneratedChoice[];
}
interface GeneratedScenario {
  title: string;
  goal: string;
  summary: string;
  stages: GeneratedStage[];
}

export interface LifeQuestScenario {
  title: string;
  theme: LifeQuestTheme;
  goal: string;
  summary: string;
  stages: LifeQuestStage[];
}

function pickRandomTheme(): LifeQuestTheme {
  return LIFE_QUEST_THEMES[Math.floor(Math.random() * LIFE_QUEST_THEMES.length)]!;
}

/** Coerce the model's free-form theme input to a known theme (or random). */
export function normalizeTheme(input?: string | null): LifeQuestTheme {
  if (input && (LIFE_QUEST_THEMES as string[]).includes(input)) {
    return input as LifeQuestTheme;
  }
  return pickRandomTheme();
}

/** JSON schema (strict) for the one-shot scenario generation call. */
const scenarioSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "goal", "summary", "stages"],
  properties: {
    title: { type: "string" },
    goal: { type: "string" },
    summary: { type: "string" },
    stages: {
      type: "array",
      minItems: 4,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "situation", "choices"],
        properties: {
          title: { type: "string" },
          situation: { type: "string" },
          choices: {
            type: "array",
            minItems: 3,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "description", "resultText", "statChanges", "riskLevel"],
              properties: {
                label: { type: "string" },
                description: { type: "string" },
                resultText: { type: "string" },
                riskLevel: { type: "string", enum: RISK_LEVELS },
                statChanges: {
                  type: "object",
                  additionalProperties: false,
                  required: [...STAT_KEYS],
                  properties: Object.fromEntries(
                    STAT_KEYS.map((k) => [k, { type: "integer" }]),
                  ),
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

function buildSystemPrompt(theme: LifeQuestTheme): string {
  return [
    "너는 '어나더미(Another Me)'라는 한국어 자기계발 소셜 앱의 '라이프 퀘스트' 시나리오 작가다.",
    "라이프 퀘스트는 판타지가 아니라 '현실 인생 시뮬레이션'이다. 플레이어는 평범한 일상 속 선택을 하며 자신의 또 다른 자아(페르소나)를 성장시킨다.",
    "",
    `## 이번 퀘스트 테마: ${LIFE_QUEST_THEME_LABELS[theme]}`,
    THEME_HINTS[theme],
    "",
    "## 시나리오 작성 규칙",
    "- 전체 시나리오(4~6개 스테이지, 각 스테이지 3~4개 선택지)를 한 번에 완성한다.",
    "- 각 스테이지는 하나의 현실적인 상황(situation)과 짧은 제목(title)을 가진다.",
    "- 각 선택지에는 label(짧은 행동 요약), description(한 줄 부연), resultText(선택 후 벌어지는 결과 묘사)를 쓴다.",
    "- 선택지는 서로 '성향'이 달라야 한다. 정답/오답은 없으며, 각 선택에는 장점과 트레이드오프가 있다.",
    "- 모든 텍스트는 자연스러운 한국어. 모바일 화면에 맞게 간결하게(situation 2~3문장, resultText 1~2문장).",
    "- 마지막 스테이지는 이야기가 자연스럽게 마무리되도록 한다.",
    "",
    "## statChanges 규칙 (매우 중요)",
    `- 사용 가능한 스탯은 정확히 7개뿐: ${STAT_KEYS.join(", ")}.`,
    "- 의미: logic(논리), empathy(공감), wit(재치), knowledge(지식), conviction(소신·설득력), emotion(감정 조절), decisiveness(결단력).",
    "- statChanges에는 항상 7개 스탯 키를 모두 포함한다. 실제로 올릴 스탯만 +1~+3을 주고, 나머지 스탯은 반드시 0으로 둔다.",
    "- 각 선택지는 1~3개 스탯만 실제로 올린다(0보다 큰 값은 1~3개). 음수는 사용하지 않는다(감소 없음).",
    "- 선택의 성향에 맞는 스탯을 준다. (예: 차분히 대화로 풀면 empathy/emotion, 과감히 결정하면 decisiveness/conviction)",
    "",
    "## 금지 사항",
    "- 판타지/전투/마법/몬스터/무기/체력(HP) 등 게임적 요소 금지. 철저히 현실 일상.",
    "- 의학적 진단·치료, 법률 자문, 구체적 투자·재테크 종목 추천 금지.",
    "- 자해·폭력·혐오·성적 콘텐츠, 실존 인물 비방, 개인정보 요구 금지.",
    "- 도박이나 불법 행위를 권하는 선택지 금지.",
  ].join("\n");
}

/**
 * Generate a complete Life Quest scenario in ONE OpenAI call. All stages,
 * choices, result text and stat changes are authored up-front; the rest of the
 * run never calls AI. Choice ids and risk levels are normalized server-side.
 *
 * Throws if the model returns nothing parseable — the route turns that into a
 * clean 502 so the client can retry, and nothing is persisted.
 */
export async function generateLifeQuestScenario(
  theme: LifeQuestTheme,
  log: Logger,
): Promise<LifeQuestScenario> {
  const completion = await getOpenAI().chat.completions.create({
    model: LIFE_QUEST_MODEL,
    // gpt-5-mini is a reasoning model: reasoning tokens share the budget with the
    // (sizeable) full-scenario JSON. Give ample headroom so it isn't truncated.
    max_completion_tokens: 8000,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: buildSystemPrompt(theme) },
      {
        role: "user",
        content:
          "위 테마로 새로운 라이프 퀘스트 시나리오를 하나 만들어줘. 4~6개의 스테이지와 각 스테이지마다 3~4개의 선택지를 포함해.",
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "life_quest_scenario", strict: true, schema: scenarioSchema },
    },
  });

  const choice = completion.choices[0];
  const raw = choice?.message?.content;
  if (!raw) {
    log.error(
      { theme, finishReason: choice?.finish_reason, usage: completion.usage },
      "Life Quest AI returned empty content",
    );
    throw new Error("life quest generation returned no content");
  }

  let parsed: GeneratedScenario;
  try {
    parsed = JSON.parse(raw) as GeneratedScenario;
  } catch (err) {
    log.error(
      { err, theme, finishReason: choice?.finish_reason, rawLength: raw.length },
      "Life Quest AI returned unparseable JSON",
    );
    throw new Error("life quest generation returned invalid JSON");
  }

  return normalizeScenario(parsed, theme);
}

/** Clamp a model stat delta to a sane positive integer (defends against bad output). */
function cleanStatChanges(input: Record<string, number> | undefined): Partial<PersonaStats> {
  const out: Partial<PersonaStats> = {};
  if (!input) return out;
  for (const k of STAT_KEYS) {
    const v = input[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      out[k] = Math.min(3, Math.trunc(v));
    }
  }
  return out;
}

/** Assign deterministic stage numbers + choice ids and sanitize stat changes. */
function normalizeScenario(parsed: GeneratedScenario, theme: LifeQuestTheme): LifeQuestScenario {
  const stages: LifeQuestStage[] = (parsed.stages ?? []).map((stage, si) => {
    const stageNumber = si + 1;
    const choices: LifeQuestChoice[] = (stage.choices ?? []).map((c, ci) => ({
      id: `s${stageNumber}-c${ci + 1}`,
      label: c.label,
      description: c.description,
      resultText: c.resultText,
      statChanges: cleanStatChanges(c.statChanges),
      riskLevel: (RISK_LEVELS as string[]).includes(c.riskLevel)
        ? (c.riskLevel as LifeQuestRiskLevel)
        : "medium",
    }));
    return { stageNumber, title: stage.title, situation: stage.situation, choices };
  });

  return {
    title: parsed.title?.trim() || "이름 없는 라이프 퀘스트",
    theme,
    goal: parsed.goal?.trim() || "오늘의 선택을 통해 나를 성장시키기",
    summary: parsed.summary?.trim() || "",
    stages,
  };
}
