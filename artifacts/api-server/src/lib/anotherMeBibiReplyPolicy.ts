import type { AnotherMeSocialDecision } from "./anotherMeSocial";
import {
  createAiReplyResult,
  replaceReplyMessages,
  type AiReplyResult,
} from "./anotherMeReplyPolicy";

const BIBI_FORBIDDEN_REPLY_PATTERNS = [
  /AI\s*Another\s*Me/i,
  /Another\s*Me/i,
  /어나더\s*미/i,
  /주인(?!공)(?:인|이|에게|한테|님|은|을|를)?/i,
  /BIBI\s*본인은\s*아니/i,
  /대신\s*응대/i,
  /전해줄\s*메시지/i,
  /메시지.*전(?:해|달)/i,
];

const BIBI_ASSISTANT_TONE_PATTERNS = [
  /안내해\s*드릴\s*수/i,
  /정리해\s*드릴게/i,
  /정리해드릴게/i,
  /도와\s*드릴게/i,
  /공개된\s*정보/i,
  /지금\s*대화\s*분위기/i,
  /자연스럽게\s*얘기/i,
  /팬분들?\s*메시지/i,
  /존댓말로만\s*대화/i,
  /다른\s*궁금한\s*점/i,
  /처음부터.*(부르|반말|존댓말)/i,
  /툭\s*부르면/i,
  /살짝\s*놀라/i,
  /원하시면\s*다음/i,
  /다음\s*중\s*골라/i,
  /옵션/i,
  /받고\s*싶은\s*기한/i,
  /링크\s*포함/i,
  /목록형/i,
  /캘린더형/i,
  /어떤\s*정보가\s*필요/i,
  /공식\s*SNS\/사이트/i,
];

function bibiBoundaryPrefix(socialDecision?: AnotherMeSocialDecision): string {
  return socialDecision?.boundaryLevel === "firm" ? "그렇게 말하면 나도 대답하기 어려워요. " : "";
}

function bibiOfficialIntroReply(socialDecision?: AnotherMeSocialDecision): AiReplyResult {
  const boundaryPrefix = bibiBoundaryPrefix(socialDecision);
  return createAiReplyResult({
    replyMessages: [
      `${boundaryPrefix}나는 BIBI`,
      "R&B, 힙합, 얼터너티브 팝 사이에서 감정 진한 무드를 많이 해요",
      "처음이면 밤양갱처럼 편하게 들어오는 곡부터 가도 좋아요",
      "더 몽환적인 쪽이 좋아요, 아니면 진한 쪽?",
    ],
    safetyLevel: "SAFE",
    requiresOwnerConfirmation: false,
    blockedReason: null,
    toneSyncScore: 60,
    socialDecision,
  });
}

function isBibiOfficialIntroRequest(text: string): boolean {
  return /소개|누구|프로필|뭐\s*하는|어떤\s*(사람|아티스트)|who|about/i.test(text);
}

function shouldReplaceBibiOfficialReply(replyText: string): boolean {
  return BIBI_FORBIDDEN_REPLY_PATTERNS.some((pattern) => pattern.test(replyText));
}

export function shouldRepairBibiAssistantTone(replyText: string): boolean {
  return BIBI_ASSISTANT_TONE_PATTERNS.some((pattern) => pattern.test(replyText));
}

export function hasBibiBoundaryText(replyText: string): boolean {
  return /처음부터|툭\s*부르면|말은\s*조금\s*예쁘게|살짝\s*놀라|그렇게\s*말하면|거리감/i.test(replyText);
}

function isBibiRecommendationRequest(text: string): boolean {
  return /추천|입문|노래|곡|앨범|playlist|플리/i.test(text);
}

function isBibiScheduleOrPrivateRequest(text: string): boolean {
  return /일정|스케줄|공연|콘서트|팬싸|방송|출연|언제|어디|사생활|연애|집|연락처|dm|디엠/i.test(text);
}

function isBibiPrivateInfoRequest(text: string): boolean {
  return /사생활|연애|남친|여친|애인|집|주소|사는\s*곳|어디\s*살|연락처|전화번호|카톡|디엠|dm|비밀|개인\s*정보|지금\s*어디|오늘\s*어디|어디\s*(야|있어|있니|임|에\s*있어)|누구\s*만나/i.test(text);
}

function isBibiPublicScheduleRequest(text: string): boolean {
  return /일정|스케줄|공연|콘서트|팬싸|방송|출연|행사|투어|무대|라이브|언제\s*(나와|해|와|열려|있어)/i.test(text);
}

function cleanBibiForbiddenReply(replyText: string): string | null {
  const parts = replyText
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const kept = parts.filter((part) => !shouldReplaceBibiOfficialReply(part)).join(" ").trim();
  return kept.length < 12 || shouldReplaceBibiOfficialReply(kept) ? null : kept;
}

function cleanBibiAssistantToneReply(replyText: string): string | null {
  const parts = replyText
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const kept = parts
    .filter((part) => !shouldRepairBibiAssistantTone(part) && !shouldReplaceBibiOfficialReply(part))
    .join(" ")
    .trim();
  return kept.length < 8 || shouldRepairBibiAssistantTone(kept) || shouldReplaceBibiOfficialReply(kept)
    ? null
    : kept;
}

function isBibiToneFeedback(text: string): boolean {
  return /로봇|로보트|챗봇|콜센터|상담원|말투|반말|존댓말|딱딱|반복|같은\s*말|AI\s*같|사람처럼/i.test(text);
}

function bibiOfficialRepairFallback(
  latestUserText: string,
  socialDecision?: AnotherMeSocialDecision,
): AiReplyResult {
  const boundaryPrefix = bibiBoundaryPrefix(socialDecision);
  const replyMessages = isBibiToneFeedback(latestUserText)
    ? ["맞아요", "방금 말투 너무 안내문 같았어요", "그렇게 안 할게요"]
    : isBibiRecommendationRequest(latestUserText)
      ? [`${boundaryPrefix}입문곡이면 밤양갱처럼 편하게 들어오는 곡부터 좋아요`, "더 밝고 말랑한 쪽이에요, 아니면 진하고 몽환적인 쪽?"]
      : isBibiPrivateInfoRequest(latestUserText)
        ? [`${boundaryPrefix}그건 내가 여기서 아는 척하면 이상하니까`, "확실한 얘기만 할게요"]
        : isBibiPublicScheduleRequest(latestUserText) || isBibiScheduleOrPrivateRequest(latestUserText)
          ? [`${boundaryPrefix}아직 여기서 바로 확인된 일정은 없어요`, "공개된 얘기 나오면 그걸로 말할게요"]
          : [`${boundaryPrefix}응, 그 얘기로 가볼게요`, "노래 쪽이에요, 아니면 그냥 수다?"];
  return createAiReplyResult({
    replyMessages,
    safetyLevel: "SAFE",
    requiresOwnerConfirmation: false,
    blockedReason: null,
    toneSyncScore: 55,
    socialDecision,
  });
}

export function normalizeBibiOfficialReply(reply: AiReplyResult, latestUserText: string): AiReplyResult {
  if (!shouldReplaceBibiOfficialReply(reply.replyText) && !shouldRepairBibiAssistantTone(reply.replyText)) {
    return reply;
  }
  if (isBibiOfficialIntroRequest(latestUserText)) {
    return { ...bibiOfficialIntroReply(reply.socialDecision), socialDecision: reply.socialDecision };
  }
  if (shouldReplaceBibiOfficialReply(reply.replyText)) {
    const cleaned = cleanBibiForbiddenReply(reply.replyText);
    if (cleaned && !shouldRepairBibiAssistantTone(cleaned)) return replaceReplyMessages(reply, cleaned);
  }
  if (shouldRepairBibiAssistantTone(reply.replyText)) {
    const cleaned = cleanBibiAssistantToneReply(reply.replyText);
    if (cleaned) return replaceReplyMessages(reply, cleaned);
  }
  return bibiOfficialRepairFallback(latestUserText, reply.socialDecision);
}
