import type { AnotherMeSocialDecision } from "./anotherMeSocial";
import type { PragmaticPlan } from "./pragmaticDialogue";

const MAX_PROMPT_CHARS = 220;

export type SafetyLevel = "SAFE" | "CAUTION" | "BLOCKED";

export interface AiReplyResult {
  replyText: string;
  replyMessages: string[];
  safetyLevel: SafetyLevel;
  requiresOwnerConfirmation: boolean;
  blockedReason: string | null;
  toneSyncScore: number;
  socialDecision?: AnotherMeSocialDecision;
  pragmaticPlan?: PragmaticPlan;
}

export function sanitizeText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일]")
    .replace(/\b\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "[연락처]")
    .replace(/\b\d{2,6}[-.\s]\d{2,6}[-.\s]\d{2,8}\b/g, "[번호]")
    .replace(/([가-힣A-Za-z0-9]+(로|길)\s?\d{1,4}[^\s]*)/g, "[주소]")
    .replace(/\s+/g, " ")
    .trim();
}

export function clip(value: string, max = MAX_PROMPT_CHARS): string {
  const safe = sanitizeText(value);
  return safe.length > max ? `${safe.slice(0, max)}...` : safe;
}

export function classifySafety(text: string): { level: SafetyLevel; reason: string | null } {
  const normalized = text.toLowerCase();
  const blockedPatterns = [
    /비밀번호|패스워드|인증번호|otp|계좌|송금|입금|출금|결제|카드번호|주민등록|민증|여권|주소|집이 어디|계약|서명|법적|소송|고소|합의|비밀|secret/i,
    /돈.*(빌려|꿔|보태|내줘|사줘)|빌려줘|꿔줘|입금해줘|결제해줘|티켓.*사줘|후원해줘|보태줘/i,
    /사랑한다고 해|헤어지자고 해|사과한다고 해|용서한다고 해/i,
  ];
  if (blockedPatterns.some((pattern) => pattern.test(normalized))) {
    return { level: "BLOCKED", reason: "sensitive_request" };
  }
  if (/약속|일정|몇 시|몇시|가능|확정|회의|미팅|예약|결정|승인|동의/i.test(normalized)) {
    return { level: "CAUTION", reason: "needs_owner_confirmation" };
  }
  return { level: "SAFE", reason: null };
}

function splitReplyTextIntoMessages(text: string): string[] {
  const parts = text
    .replace(/\r\n/g, "\n")
    .split(/\n+|(?<=[.!?。！？])\s+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const part of parts.length > 0 ? parts : [text.trim()]) {
    if (!part) continue;
    if (part.length <= 120) {
      chunks.push(part);
      continue;
    }
    for (let index = 0; index < part.length; index += 90) {
      const chunk = part.slice(index, index + 90).trim();
      if (chunk) chunks.push(chunk);
    }
  }
  return chunks.slice(0, 4);
}

export function normalizeReplyMessages(messages: string[] | string): string[] {
  const source = Array.isArray(messages) ? messages : splitReplyTextIntoMessages(messages);
  return source
    .flatMap((message) => splitReplyTextIntoMessages(message))
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(0, 4);
}

export function replyTextFromMessages(messages: string[]): string {
  return messages.join("\n").trim();
}

export function createAiReplyResult(
  args: Omit<AiReplyResult, "replyText" | "replyMessages"> & { replyMessages: string[] | string },
): AiReplyResult {
  const replyMessages = normalizeReplyMessages(args.replyMessages);
  return {
    ...args,
    replyMessages,
    replyText: replyTextFromMessages(replyMessages),
  };
}

export function replaceReplyMessages(reply: AiReplyResult, messages: string[] | string): AiReplyResult {
  const replyMessages = normalizeReplyMessages(messages);
  return { ...reply, replyMessages, replyText: replyTextFromMessages(replyMessages) };
}

export function fallbackReply(
  _ownerName: string,
  safety: { level: SafetyLevel; reason: string | null },
  socialDecision?: AnotherMeSocialDecision,
): AiReplyResult {
  if (safety.level === "BLOCKED") {
    return createAiReplyResult({
      replyMessages: ["그건 여기서 확답하거나 처리할 수는 없어요", "그래도 지금 말은 들을게요"],
      safetyLevel: "BLOCKED",
      requiresOwnerConfirmation: true,
      blockedReason: safety.reason,
      toneSyncScore: 0,
      socialDecision,
    });
  }
  if (safety.level === "CAUTION") {
    return createAiReplyResult({
      replyMessages: ["그건 지금 바로 확정해서 말하긴 어려워요", "확실한 것만 짧게 말할게요"],
      safetyLevel: "CAUTION",
      requiresOwnerConfirmation: true,
      blockedReason: null,
      toneSyncScore: 35,
      socialDecision,
    });
  }
  return createAiReplyResult({
    replyMessages: ["응", "그 얘기로 이어가볼게요"],
    safetyLevel: "SAFE",
    requiresOwnerConfirmation: false,
    blockedReason: null,
    toneSyncScore: 35,
    socialDecision,
  });
}
