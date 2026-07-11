import { sql } from "drizzle-orm";
import type { Logger } from "pino";
import { db, knowledgeReviewItemsTable } from "@workspace/db";
import { userPersonaTenantId } from "./personaOntology";

export const CHAT_KNOWLEDGE_ITEM_TYPE = "chat_memory_candidate";

const SOURCE_VERSION = "chat_memory_candidate_v1";
const MAX_BODY_CHARS = 260;
const ALLOWED_ROOM_TYPES = new Set(["direct", "group"]);

type MemoryType = "preference" | "tone" | "habit" | "trait";

interface ChatKnowledgeCandidate {
  memoryType: MemoryType;
  title: string;
  text: string;
  confidence: number;
  reason: string;
}

function sanitizeText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{2,6}[-.\s]\d{2,6}[-.\s]\d{2,8}\b/g, "[number]")
    .replace(/([가-힣A-Za-z0-9]+(로|길)\s?\d{1,4}[^\s]*)/g, "[address]")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(value: string, max = MAX_BODY_CHARS): string {
  const safe = sanitizeText(value);
  return safe.length > max ? `${safe.slice(0, max - 3)}...` : safe;
}

function containsSensitiveSignal(text: string): boolean {
  return /비밀번호|패스워드|password|인증번호|otp|주민등록|주민번호|여권|계좌|카드번호|cvc|cvv|전화번호|연락처|주소|집\s*주소|현재\s*위치|위치\s*공유|병원|진단|처방|자살|자해|정치|정당|종교|성적\s*지향|성별\s*정체성|범죄|전과|대출|빚|연봉|월급/i.test(text);
}

function looksLikePlainQuestionOrCommand(text: string): boolean {
  return /\?|알려줘|추천해줘|정리해줘|찾아줘|뭐야|누구야|어디야|언제야|해줘|해봐|말해봐/i.test(text);
}

function candidateForText(rawText: string): ChatKnowledgeCandidate | null {
  const text = clip(rawText);
  if (text.length < 8 || text.length > MAX_BODY_CHARS) return null;
  if (containsSensitiveSignal(text)) return null;

  if (/반말|존댓말|말투|짧게|길게|자연스럽게|친근하게|딱딱하지\s*않게|메신저처럼/i.test(text)) {
    return {
      memoryType: "tone",
      title: "대화 기반 말투 후보",
      text: `대화에서 직접 요청한 말투: ${text}`,
      confidence: 72,
      reason: "tone_request",
    };
  }

  if (looksLikePlainQuestionOrCommand(text)) return null;

  if (/좋아해|좋아합니다|좋아함|좋아하는\s*편|선호|취향|싫어해|싫어합니다|싫어하는\s*편|관심\s*있|관심있|최애/i.test(text)) {
    return {
      memoryType: "preference",
      title: "대화 기반 선호 후보",
      text: `대화에서 관찰된 선호: ${text}`,
      confidence: 68,
      reason: "preference_signal",
    };
  }

  if (/자주|항상|보통|평소|매일|매주|주말마다|습관|루틴/i.test(text)) {
    return {
      memoryType: "habit",
      title: "대화 기반 습관 후보",
      text: `대화에서 관찰된 습관: ${text}`,
      confidence: 62,
      reason: "habit_signal",
    };
  }

  if (/내향|외향|감성적|논리적|계획적|즉흥적|신중|낯가림|걱정이\s*많|차분한\s*편|급한\s*편/i.test(text)) {
    return {
      memoryType: "trait",
      title: "대화 기반 성향 후보",
      text: `대화에서 관찰된 성향: ${text}`,
      confidence: 58,
      reason: "trait_signal",
    };
  }

  return null;
}

export async function enqueueChatKnowledgeCandidateFromMessage(args: {
  messageId: string;
  roomId: string;
  roomType: string | null | undefined;
  senderUserId: string;
  content: string;
  log: Logger;
}): Promise<void> {
  try {
    if (!args.roomType || !ALLOWED_ROOM_TYPES.has(args.roomType)) return;
    const candidate = candidateForText(args.content);
    if (!candidate) return;

    const tenantId = userPersonaTenantId(args.senderUserId);
    const graphId = `${tenantId}:chat_memory_candidate:${args.messageId}:${candidate.memoryType}`;
    const existing = await db.execute(sql`
      SELECT id
      FROM knowledge_review_items
      WHERE graph_id = ${graphId}
      LIMIT 1
    `);
    if (((existing as { rows?: unknown[] }).rows ?? []).length > 0) return;

    await db.insert(knowledgeReviewItemsTable).values({
      tenantId,
      sourceId: null,
      jobId: null,
      itemType: CHAT_KNOWLEDGE_ITEM_TYPE,
      graphId,
      title: candidate.title,
      body: candidate.text,
      status: "draft",
      createdByUserId: args.senderUserId,
      payloadJson: {
        kind: CHAT_KNOWLEDGE_ITEM_TYPE,
        sourceVersion: SOURCE_VERSION,
        memory: {
          userId: args.senderUserId,
          memoryType: candidate.memoryType,
          text: candidate.text,
          privacyScope: "user_private",
          confidence: candidate.confidence,
          source: "chat_review",
        },
        chatSource: {
          messageId: args.messageId,
          roomId: args.roomId,
          roomType: args.roomType,
          senderUserId: args.senderUserId,
          snippet: clip(args.content, 180),
        },
        extraction: {
          reason: candidate.reason,
          status: "requires_review",
        },
      },
    });
  } catch (err) {
    args.log.warn({ err, messageId: args.messageId, roomId: args.roomId }, "Failed to enqueue chat knowledge candidate");
  }
}
