import { desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  DEFAULT_PERSONA_STATS,
  personaIdentityHistoryTable,
  personasTable,
  type PersonaIdentityHistory,
  type PersonaStats,
} from "@workspace/db";
import { computeLevel, ensurePersona } from "./growth";

type StatKey = keyof PersonaStats;

/** Korean label for each stat as a noun ("능력치"). */
export const STAT_LABEL: Record<StatKey, string> = {
  logic: "논리력",
  empathy: "공감력",
  wit: "순발력",
  knowledge: "지식",
  conviction: "신념",
  emotion: "감정 표현",
  decisiveness: "결단력",
};

/** Per-stat phrase used when this stat is the user's weakest growth area. */
const GROWTH_HINT: Record<StatKey, string> = {
  logic: "논리적으로 근거를 정리하는 연습을 더하면",
  empathy: "상대의 감정에 한 번 더 귀 기울이면",
  wit: "가볍게 분위기를 풀어주는 여유를 더하면",
  knowledge: "다양한 분야의 지식을 넓혀가면",
  conviction: "자신의 신념을 분명하게 표현하면",
  emotion: "감정을 솔직하게 드러내는 연습을 하면",
  decisiveness: "조금 더 과감하게 결정하고 행동하면",
};

interface ArchetypeDef {
  key: string;
  /** Display name, e.g. "전략가형". */
  name: string;
  /** Short rank title used on the card, e.g. "전략가". */
  title: string;
  /** The two signature stats that define this archetype. */
  signature: [StatKey, StatKey];
  /** Characteristic Korean traits. */
  traits: string[];
  /** Short first-person motto for the shareable card. */
  motto: string;
}

/**
 * Rule-based archetypes. NO AI is used — the archetype is chosen purely from the
 * persona's deterministic stats. Each archetype is defined by a pair of signature
 * stats; the persona is matched to the archetype whose signature stats it scores
 * highest in. `observer` is the balanced/low-activity fallback and has no
 * signature (it is never scored, only used as a default).
 */
const ARCHETYPES: ArchetypeDef[] = [
  {
    key: "strategist",
    name: "전략가형",
    title: "전략가",
    signature: ["logic", "conviction"],
    traits: ["논리적", "분석적", "주도적"],
    motto: "나는 생각으로 길을 여는 또 다른 자아입니다.",
  },
  {
    key: "harmonizer",
    name: "조율자형",
    title: "조율자",
    signature: ["empathy", "emotion"],
    traits: ["공감적", "따뜻한", "배려심 깊은"],
    motto: "나는 마음과 마음을 잇는 또 다른 자아입니다.",
  },
  {
    key: "explorer",
    name: "탐험가형",
    title: "탐험가",
    signature: ["wit", "knowledge"],
    traits: ["호기심 많은", "창의적인", "재치 있는"],
    motto: "나는 호기심으로 세상을 넓혀가는 또 다른 자아입니다.",
  },
  {
    key: "pioneer",
    name: "개척자형",
    title: "개척자",
    signature: ["conviction", "decisiveness"],
    traits: ["추진력 있는", "단호한", "도전적인"],
    motto: "나는 망설임 없이 나아가는 또 다른 자아입니다.",
  },
  {
    key: "sage",
    name: "현자형",
    title: "현자",
    signature: ["knowledge", "logic"],
    traits: ["사려 깊은", "박식한", "침착한"],
    motto: "나는 깊이로 답을 찾아가는 또 다른 자아입니다.",
  },
  {
    key: "entertainer",
    name: "재담꾼형",
    title: "재담꾼",
    signature: ["wit", "empathy"],
    traits: ["유쾌한", "친화적인", "순발력 있는"],
    motto: "나는 분위기를 밝히는 또 다른 자아입니다.",
  },
  {
    key: "activist",
    name: "행동가형",
    title: "행동가",
    signature: ["decisiveness", "emotion"],
    traits: ["열정적인", "실행력 있는", "솔직한"],
    motto: "나는 행동으로 증명하는 또 다른 자아입니다.",
  },
];

const OBSERVER: ArchetypeDef = {
  key: "observer",
  name: "관찰자형",
  title: "관찰자",
  signature: ["logic", "empathy"], // unused (fallback)
  traits: ["균형 잡힌", "신중한", "관찰력 있는"],
  motto: "나는 현실의 나를 닮아 성장하는 또 다른 자아입니다.",
};

/** Below this total of stat points the persona is still "forming" → observer. */
const MIN_TOTAL_FOR_ARCHETYPE = 5;

export interface PersonaIdentity {
  archetypeKey: string;
  /** Display archetype name, e.g. "전략가형". */
  archetype: string;
  /** Short rank title, e.g. "전략가". */
  title: string;
  primaryTraits: string[];
  /** Top stats as ability nouns, strongest first. */
  strengths: string[];
  /** Weakest stats framed as growth areas. */
  weaknesses: string[];
  growthDirection: string;
  motto: string;
}

/** Sort stat keys by value, strongest first (stable on ties by fixed order). */
function rankedStats(stats: PersonaStats): { key: StatKey; value: number }[] {
  const order: StatKey[] = [
    "logic",
    "empathy",
    "wit",
    "knowledge",
    "conviction",
    "emotion",
    "decisiveness",
  ];
  return order
    .map((key) => ({ key, value: stats[key] ?? 0 }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Derive the persona's identity from its deterministic stats (rule-based, no AI).
 * Picks the archetype whose two signature stats sum highest; falls back to
 * "관찰자형" when the persona has too little activity or no clear strength.
 */
export function computeIdentity(stats: PersonaStats): PersonaIdentity {
  const safeStats: PersonaStats = { ...DEFAULT_PERSONA_STATS, ...stats };
  const total = Object.values(safeStats).reduce((a, b) => a + (b ?? 0), 0);
  const ranked = rankedStats(safeStats);

  let chosen: ArchetypeDef = OBSERVER;
  if (total >= MIN_TOTAL_FOR_ARCHETYPE && ranked[0].value > 0) {
    let bestScore = -1;
    for (const def of ARCHETYPES) {
      const score = def.signature.reduce((sum, k) => sum + (safeStats[k] ?? 0), 0);
      if (score > bestScore) {
        bestScore = score;
        chosen = def;
      }
    }
  }

  // Strengths: up to 3 strongest stats with any points.
  const strengths = ranked
    .filter((s) => s.value > 0)
    .slice(0, 3)
    .map((s) => STAT_LABEL[s.key]);

  // Weaknesses / growth areas: the 2 lowest stats (ascending).
  const ascending = [...ranked].reverse();
  const weaknesses =
    total > 0 ? ascending.slice(0, 2).map((s) => STAT_LABEL[s.key]) : [];

  // Growth direction: target the single weakest stat with a concrete hint.
  let growthDirection: string;
  if (total < MIN_TOTAL_FOR_ARCHETYPE) {
    growthDirection =
      "채팅·배틀·던전으로 다양한 활동을 시작하면 당신만의 정체성이 또렷해질 거예요.";
  } else {
    const weakest = ascending[0].key;
    growthDirection = `${GROWTH_HINT[weakest]} 더 균형 잡힌 어나더 미로 성장할 수 있어요.`;
  }

  return {
    archetypeKey: chosen.key,
    archetype: chosen.name,
    title: chosen.title,
    primaryTraits: chosen.traits,
    strengths,
    weaknesses,
    growthDirection,
    motto: chosen.motto,
  };
}

export interface PersonaCard {
  name: string;
  level: number;
  title: string;
  archetype: string;
  archetypeKey: string;
  personaSummary: string | null;
  strengths: string[];
  weaknesses: string[];
  primaryTraits: string[];
  growthDirection: string;
  motto: string;
  houseName: string | null;
  history: { archetype: string; level: number; createdAt: string }[];
}

/** Map a history row to its API shape. */
function serializeHistory(row: PersonaIdentityHistory) {
  return {
    archetype: row.archetype,
    level: row.level,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Build the persona card for a user. Computes the (derived) identity and records
 * a new history row only when the archetype changed since the latest stored one,
 * so archetype transitions form an auditable timeline. This never touches XP,
 * stats, or AI-analysis fields.
 */
export async function getPersonaCard(
  userId: string,
  displayName: string,
): Promise<PersonaCard | null> {
  const persona = await ensurePersona(userId);
  if (!persona) return null;

  const level = computeLevel(persona.xp);
  const identity = computeIdentity(persona.stats);

  // Record the archetype only when it actually changes (or on first computation).
  // The latest-check + insert run in one transaction behind a row lock on the
  // persona (same pattern as growth) so concurrent card fetches for the same user
  // serialize and can never insert duplicate consecutive archetype rows. This
  // only writes to the history table — it never mutates xp/stats/level/xp_events.
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: personasTable.id })
      .from(personasTable)
      .where(eq(personasTable.userId, userId))
      .for("update");
    if (!locked) return;

    const [latest] = await tx
      .select()
      .from(personaIdentityHistoryTable)
      .where(eq(personaIdentityHistoryTable.userId, userId))
      .orderBy(desc(personaIdentityHistoryTable.createdAt))
      .limit(1);

    if (!latest || latest.archetype !== identity.archetype) {
      await tx
        .insert(personaIdentityHistoryTable)
        .values({ userId, archetype: identity.archetype, level });
    }
  });

  const history = await db
    .select()
    .from(personaIdentityHistoryTable)
    .where(eq(personaIdentityHistoryTable.userId, userId))
    .orderBy(desc(personaIdentityHistoryTable.createdAt))
    .limit(10);

  return {
    name: `${displayName}의 어나더 미`,
    level,
    title: identity.title,
    archetype: identity.archetype,
    archetypeKey: identity.archetypeKey,
    personaSummary: persona.summary ?? null,
    strengths: identity.strengths,
    weaknesses: identity.weaknesses,
    primaryTraits: identity.primaryTraits,
    growthDirection: identity.growthDirection,
    motto: identity.motto,
    houseName: null,
    history: history.map(serializeHistory),
  };
}
