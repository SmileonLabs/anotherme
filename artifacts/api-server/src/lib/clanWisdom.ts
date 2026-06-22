import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  CLAN_MEMORY_TYPES,
  clanMembersTable,
  clanMemoriesTable,
  clansTable,
  clanWisdomTable,
  usersTable,
  type ClanMemoryType,
  type ClanRole,
  type ClanWisdomFields,
} from "@workspace/db";
import type { Logger } from "pino";
import { getOpenAI } from "./aiClient";
import { getClanIdentity } from "./clanGrowth";

const WISDOM_MODEL = "gpt-5-mini";

/** How many of the most recent memories are fed to the model as context. */
const WISDOM_MEMORY_CONTEXT_LIMIT = 60;
const WISDOM_FIELD_MAX = 600;

const CLAN_MEMORY_TYPE_LABELS: Record<ClanMemoryType, string> = {
  strategy: "전략",
  lesson: "교훈",
  value: "가치",
  achievement: "업적",
  warning: "경고",
};

/**
 * The clan's AI-summarized collective wisdom, plus the (non-sensitive) display
 * name of whoever last generated it. Never exposes email/clerkId or any raw
 * chat/battle/dungeon content.
 */
export interface ClanWisdomView {
  clanId: string;
  philosophy: string;
  strategy: string;
  values: string;
  culture: string;
  motto: string;
  sourceMemoryCount: number;
  generatedByUserId: string | null;
  generatedByName: string | null;
  generatedAt: string;
}

/** Domain error mapped to an HTTP status + Korean message by the route layer. */
export class ClanWisdomError extends Error {
  constructor(
    public code:
      | "not_found"
      | "not_member"
      | "forbidden"
      | "no_memories"
      | "ai_failed",
    message: string,
  ) {
    super(message);
    this.name = "ClanWisdomError";
  }
}

interface MembershipInfo {
  role: ClanRole;
}

async function getMembershipIn(clanId: string, userId: string): Promise<MembershipInfo | null> {
  const [m] = await db
    .select({ role: clanMembersTable.role })
    .from(clanMembersTable)
    .where(and(eq(clanMembersTable.clanId, clanId), eq(clanMembersTable.userId, userId)));
  return m ? { role: m.role as ClanRole } : null;
}

async function clanExists(clanId: string): Promise<boolean> {
  const [c] = await db
    .select({ id: clansTable.id })
    .from(clansTable)
    .where(eq(clansTable.id, clanId));
  return !!c;
}

function serializeWisdom(r: {
  clanId: string;
  philosophy: string;
  strategy: string;
  values: string;
  culture: string;
  motto: string;
  sourceMemoryCount: number;
  generatedByUserId: string | null;
  generatedByName: string | null;
  generatedAt: Date;
}): ClanWisdomView {
  return {
    clanId: r.clanId,
    philosophy: r.philosophy,
    strategy: r.strategy,
    values: r.values,
    culture: r.culture,
    motto: r.motto,
    sourceMemoryCount: r.sourceMemoryCount,
    generatedByUserId: r.generatedByUserId ?? null,
    generatedByName: r.generatedByName?.trim() || null,
    generatedAt: r.generatedAt.toISOString(),
  };
}

/**
 * Read a clan's current wisdom (members only). Returns null when none has been
 * generated yet. Read-only: never touches memory/persona/clan-exp/ranking.
 */
export async function getClanWisdom(opts: {
  clanId: string;
  meUserId: string;
}): Promise<ClanWisdomView | null> {
  const { clanId, meUserId } = opts;

  if (!(await clanExists(clanId))) {
    throw new ClanWisdomError("not_found", "존재하지 않는 가문이에요.");
  }
  const membership = await getMembershipIn(clanId, meUserId);
  if (!membership) {
    throw new ClanWisdomError("not_member", "가문 멤버만 가문의 지혜를 볼 수 있어요.");
  }

  const [row] = await db
    .select({
      clanId: clanWisdomTable.clanId,
      philosophy: clanWisdomTable.philosophy,
      strategy: clanWisdomTable.strategy,
      values: clanWisdomTable.values,
      culture: clanWisdomTable.culture,
      motto: clanWisdomTable.motto,
      sourceMemoryCount: clanWisdomTable.sourceMemoryCount,
      generatedByUserId: clanWisdomTable.generatedByUserId,
      generatedByName: usersTable.nickname,
      generatedAt: clanWisdomTable.generatedAt,
    })
    .from(clanWisdomTable)
    .leftJoin(usersTable, eq(usersTable.id, clanWisdomTable.generatedByUserId))
    .where(eq(clanWisdomTable.clanId, clanId));

  return row ? serializeWisdom(row) : null;
}

function clampField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, WISDOM_FIELD_MAX);
}

/** Email addresses. */
const PII_EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
/** Phone-number-like runs (e.g. 010-1234-5678, +82 10 1234 5678, 7+ digit runs). */
const PII_PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;

/**
 * Deterministic, prompt-independent safety net: even though the model is
 * instructed never to emit personal contact info, we never persist a summary
 * that contains an email address or phone-number-like string.
 */
function containsContactPII(fields: ClanWisdomFields): boolean {
  const blob = `${fields.philosophy}\n${fields.strategy}\n${fields.values}\n${fields.culture}\n${fields.motto}`;
  return PII_EMAIL_RE.test(blob) || PII_PHONE_RE.test(blob);
}

/**
 * Generate (or regenerate) a clan's wisdom. Owner/elder only. Reads existing
 * clan memories + collective identity, asks the AI to summarize them into a
 * philosophy/strategy/values/culture/motto, and upserts a single row per clan.
 *
 * This NEVER mutates clan memories, persona XP, clan EXP, or ranking, and never
 * stores raw conversation content — only the model's Korean summary text.
 */
export async function generateClanWisdom(opts: {
  clanId: string;
  meUserId: string;
  log: Logger;
}): Promise<ClanWisdomView> {
  const { clanId, meUserId, log } = opts;

  if (!(await clanExists(clanId))) {
    throw new ClanWisdomError("not_found", "존재하지 않는 가문이에요.");
  }
  const membership = await getMembershipIn(clanId, meUserId);
  if (!membership) {
    throw new ClanWisdomError("not_member", "가문 멤버만 이용할 수 있어요.");
  }
  if (membership.role !== "owner" && membership.role !== "elder") {
    throw new ClanWisdomError("forbidden", "가문장 또는 원로만 가문의 지혜를 갱신할 수 있어요.");
  }

  // READ-ONLY inputs: memories (most recent, capped) + collective identity.
  const memories = await db
    .select({
      memoryType: clanMemoriesTable.memoryType,
      title: clanMemoriesTable.title,
      summary: clanMemoriesTable.summary,
      tags: clanMemoriesTable.tags,
    })
    .from(clanMemoriesTable)
    .where(eq(clanMemoriesTable.clanId, clanId))
    .orderBy(desc(clanMemoriesTable.importanceScore), desc(clanMemoriesTable.createdAt))
    .limit(WISDOM_MEMORY_CONTEXT_LIMIT);

  if (memories.length === 0) {
    throw new ClanWisdomError(
      "no_memories",
      "가문 기억이 있어야 지혜를 생성할 수 있어요. 먼저 기억을 남겨주세요.",
    );
  }

  const identity = await getClanIdentity(clanId);

  const fields = await summarizeWisdom({ memories, identity, log });
  if (!fields) {
    throw new ClanWisdomError("ai_failed", "가문의 지혜를 생성하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  const values = {
    clanId,
    philosophy: fields.philosophy,
    strategy: fields.strategy,
    values: fields.values,
    culture: fields.culture,
    motto: fields.motto,
    sourceMemoryCount: memories.length,
    generatedByUserId: meUserId,
    generatedAt: new Date(),
  };

  const [row] = await db
    .insert(clanWisdomTable)
    .values(values)
    .onConflictDoUpdate({
      target: clanWisdomTable.clanId,
      set: {
        philosophy: values.philosophy,
        strategy: values.strategy,
        values: values.values,
        culture: values.culture,
        motto: values.motto,
        sourceMemoryCount: values.sourceMemoryCount,
        generatedByUserId: values.generatedByUserId,
        generatedAt: values.generatedAt,
      },
    })
    .returning();

  const [author] = await db
    .select({ nickname: usersTable.nickname })
    .from(usersTable)
    .where(eq(usersTable.id, meUserId));

  return serializeWisdom({ ...row, generatedByName: author?.nickname ?? null });
}

interface MemoryContext {
  memoryType: string;
  title: string;
  summary: string;
  tags: string[];
}

interface IdentityContext {
  dominantArchetypeLabel: string;
  topStrengths: string[];
  averageLevel: number;
  level: number;
  memberCount: number;
}

/**
 * Ask the model to distill the clan's memories + identity into a five-part
 * wisdom. Strict JSON schema. Returns null on any failure (caller maps to a
 * friendly error) — never throws except when no API key is configured.
 */
async function summarizeWisdom(opts: {
  memories: MemoryContext[];
  identity: IdentityContext | null;
  log: Logger;
}): Promise<ClanWisdomFields | null> {
  const { memories, identity, log } = opts;

  const memoryLines = memories
    .map((m) => {
      const label = CLAN_MEMORY_TYPE_LABELS[m.memoryType as ClanMemoryType] ?? m.memoryType;
      const tags = m.tags.length ? ` [${m.tags.join(", ")}]` : "";
      return `- (${label}) ${m.title}: ${m.summary}${tags}`;
    })
    .join("\n");

  const identityLine = identity
    ? `대표 성향: ${identity.dominantArchetypeLabel} / 강점: ${
        identity.topStrengths.join(", ") || "정보 없음"
      } / 평균 레벨: ${identity.averageLevel} / 가문 레벨: ${identity.level} / 멤버 수: ${identity.memberCount}`
    : "집단 정체성 정보 없음";

  const system = [
    "당신은 한국어 소셜 앱의 '가문(클랜)'을 위한 분석가입니다.",
    "주어진 '가문 기억'과 '집단 정체성'만을 근거로 가문의 집단 지혜를 요약합니다.",
    "규칙:",
    "1) 반드시 주어진 기억과 정체성에 근거해 추론하고, 없는 사실을 지어내지 마세요.",
    "2) 과장하거나 미화하지 말고 담백하고 구체적으로 작성하세요.",
    "3) 개인정보(실명, 연락처 등)나 특정 개인을 지목하는 표현을 쓰지 마세요.",
    "4) 정치적·종교적 단정이나 논쟁적 주장을 하지 마세요.",
    "5) 모든 출력은 자연스러운 한국어로 작성하세요.",
    "6) 각 항목은 2~3문장 이내로 간결하게 작성하세요. 단, 모토(motto)는 한 줄짜리 짧은 문구로 작성하세요.",
  ].join("\n");

  const user = [
    "## 가문 기억",
    memoryLines || "(기록된 기억 없음)",
    "",
    "## 집단 정체성",
    identityLine,
    "",
    "위 정보를 바탕으로 다음 다섯 가지를 작성하세요: philosophy(철학), strategy(전략), values(가치관), culture(문화), motto(모토).",
  ].join("\n");

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["philosophy", "strategy", "values", "culture", "motto"],
    properties: {
      philosophy: { type: "string" },
      strategy: { type: "string" },
      values: { type: "string" },
      culture: { type: "string" },
      motto: { type: "string" },
    },
  };

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: WISDOM_MODEL,
      max_completion_tokens: 2000,
      reasoning_effort: "minimal",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "clan_wisdom", strict: true, schema },
      },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      log.error(
        { finishReason: completion.choices[0]?.finish_reason, usage: completion.usage },
        "Clan wisdom AI returned empty content",
      );
      return null;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const fields: ClanWisdomFields = {
      philosophy: clampField(parsed.philosophy),
      strategy: clampField(parsed.strategy),
      values: clampField(parsed.values),
      culture: clampField(parsed.culture),
      motto: clampField(parsed.motto),
    };
    if (
      !fields.philosophy ||
      !fields.strategy ||
      !fields.values ||
      !fields.culture ||
      !fields.motto
    ) {
      log.error({ fields }, "Clan wisdom AI returned incomplete fields");
      return null;
    }
    if (containsContactPII(fields)) {
      log.error("Clan wisdom AI output rejected: contained contact PII");
      return null;
    }
    return fields;
  } catch (err) {
    log.error({ err }, "Clan wisdom AI call failed");
    return null;
  }
}
