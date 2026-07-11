import type { AnotherMeRelationshipType, AnotherMeToneProfile } from "@workspace/db";

export type SocialDistance = "stranger" | "fan_or_listener" | "acquaintance" | "friend" | "close_friend" | "family" | "partner" | "work";
export type RespectSignal = "polite" | "neutral" | "casual" | "overfamiliar" | "rude" | "hostile";
export type AffectiveStance = "warm" | "neutral" | "guarded" | "mildly_annoyed" | "firm";
export type SpeechRegister = "polite" | "soft_polite" | "polite_with_edge" | "casual_allowed" | "firm_polite";
export type BoundaryLevel = "none" | "light" | "firm" | "decline";
export type ResponseGoal = "answer_directly" | "light_boundary_then_answer" | "deescalate_then_answer" | "decline_sensitive";

export interface RecentMessageForSocialDecision {
  senderId: string;
  authorKind: string;
  content: string;
}

export interface AnotherMeSocialDecision {
  socialDistance: SocialDistance;
  respectSignal: RespectSignal;
  affectiveStance: AffectiveStance;
  speechRegister: SpeechRegister;
  boundaryLevel: BoundaryLevel;
  responseGoal: ResponseGoal;
  relationshipBasis: string;
  firstPersonMode: boolean;
  safetyFrame: string;
  evidence: string[];
}

interface ResolveSocialDecisionArgs {
  ownerUserId: string;
  requesterUserId: string;
  ownerName: string;
  requesterName: string;
  latestUserText: string;
  relationshipType: AnotherMeRelationshipType;
  toneProfile: AnotherMeToneProfile | null;
  recentMessages: RecentMessageForSocialDecision[];
  isOfficialPersona: boolean;
}

function hasHonorific(text: string): boolean {
  return /(요|세요|십시오|습니다|습니까|드립니다|합니다|해요|할까요|인가요|주세요|부탁드려요)([.!?~\s]|$)/i.test(text);
}

function compactKoreanText(text: string): string {
  return text.trim().replace(/[\s.!?~ㅋㅎ]+$/g, "");
}

function hasBareInformalEnding(text: string): boolean {
  const compact = compactKoreanText(text);
  if (compact.length === 0 || hasHonorific(compact)) return false;
  return /(뭐해|뭐하|궁금해|보고싶어|좋아|싫어|있어|없어|알아|몰라|해|봐|줘|말해|알려줘|추천해|정리해|가자|하자|했어|왔어|먹어|들어|봐줘)$/.test(compact);
}

function hasDirectBareAddress(text: string): boolean {
  const compact = compactKoreanText(text).toLowerCase();
  if (hasHonorific(text)) return false;
  return /^(비비|bibi)$/.test(compact) || /^(야\s*)?(비비|bibi)(야|야\s|\s)/i.test(text.trim());
}

function hasCasualSignal(text: string): boolean {
  return hasDirectBareAddress(text) || hasBareInformalEnding(text) || /(^|\s)(야|너|니가|네가)(\s|[,.!?]|$)|뭐야|누구야|뭐냐|누구냐|해줘|알려줘|소개해줘|말해봐|해봐|해라|하자|가자|있어\??$|없어\??$|했어\??$|ㅋㅋ|ㅎㅎ/i.test(text);
}

function hasCommandSignal(text: string): boolean {
  return /해줘|알려줘|소개해줘|말해봐|해봐|해라|줘봐|내놔|빨리|당장/i.test(text);
}

function hasHostileSignal(text: string): boolean {
  return /씨발|시발|병신|미친|꺼져|닥쳐|죽어|좆|개새|지랄|fuck|bitch/i.test(text);
}

function hasRudeSignal(text: string): boolean {
  return hasHostileSignal(text) || /뭐냐|누구냐|재수없|짜증나|개같|한심|멍청|바보|꺼져|닥쳐/i.test(text);
}

function hasToneFeedbackSignal(text: string): boolean {
  return /로봇|로보트|챗봇|콜센터|상담원|말투|반말|존댓말|딱딱|반복|같은\s*말|AI\s*같|사람처럼/i.test(text);
}

function isSoftOfficialFanCasual(text: string): boolean {
  const trimmed = text.trim();
  if (/^야\s+/i.test(trimmed)) return false;
  if (hasDirectBareAddress(trimmed)) return true;
  return /비비야|bibi|소개해줘|알려줘|추천해줘|노래\s*추천|누구야|뭐야|ㅋㅋ|ㅎㅎ/i.test(trimmed);
}

function inferSocialDistance(args: ResolveSocialDecisionArgs): SocialDistance {
  if (args.isOfficialPersona) return "fan_or_listener";
  if (args.relationshipType === "FAMILY") return "family";
  if (args.relationshipType === "PARTNER") return "partner";
  if (args.relationshipType === "WORK") return "work";
  if (args.relationshipType === "FRIEND") return "friend";
  return "stranger";
}

function ownerUsedCasualToRequester(args: ResolveSocialDecisionArgs): boolean {
  return args.recentMessages.some((message) => (
    message.senderId === args.ownerUserId &&
    message.authorKind === "user" &&
    hasCasualSignal(message.content) &&
    !hasHonorific(message.content)
  ));
}

function requesterUsedCasual(args: ResolveSocialDecisionArgs): boolean {
  return args.recentMessages.some((message) => (
    message.senderId === args.requesterUserId &&
    message.authorKind === "user" &&
    hasCasualSignal(message.content) &&
    !hasHonorific(message.content)
  ));
}

function hasOwnerHumanReply(args: ResolveSocialDecisionArgs): boolean {
  return args.recentMessages.some((message) => message.senderId === args.ownerUserId && message.authorKind === "user");
}

function inferRespectSignal(args: ResolveSocialDecisionArgs, distance: SocialDistance, casualAllowed: boolean): RespectSignal {
  const latest = args.latestUserText.trim();
  const polite = hasHonorific(latest);
  const casual = hasCasualSignal(latest) && !polite;
  const command = hasCommandSignal(latest);
  const cumulativeCasualWithoutReciprocity = requesterUsedCasual(args) && !ownerUsedCasualToRequester(args);
  const distantRelationship = distance === "fan_or_listener" || distance === "stranger" || distance === "work";
  if (hasHostileSignal(latest)) return "hostile";
  if (hasRudeSignal(latest)) return "rude";
  if (args.isOfficialPersona && hasToneFeedbackSignal(latest)) return polite ? "polite" : "neutral";
  if (polite) return "polite";
  if (args.isOfficialPersona && isSoftOfficialFanCasual(latest)) return "neutral";
  if (!casual) {
    if (distantRelationship && cumulativeCasualWithoutReciprocity && latest.length <= 40) return "overfamiliar";
    return "neutral";
  }
  if (casualAllowed) return "casual";
  if (["family", "partner"].includes(distance) && !command) return "casual";
  return "overfamiliar";
}

function inferRegister(distance: SocialDistance, respect: RespectSignal, casualAllowed: boolean): SpeechRegister {
  if (respect === "hostile") return "firm_polite";
  if (respect === "rude" || respect === "overfamiliar") return "polite_with_edge";
  if (casualAllowed && ["friend", "close_friend", "family", "partner"].includes(distance)) return "casual_allowed";
  if (distance === "work" || distance === "stranger" || distance === "fan_or_listener") return "polite";
  return "soft_polite";
}

function inferBoundary(respect: RespectSignal): BoundaryLevel {
  if (respect === "hostile") return "firm";
  if (respect === "rude") return "firm";
  if (respect === "overfamiliar") return "light";
  return "none";
}

function inferAffectiveStance(respect: RespectSignal, isOfficialPersona: boolean): AffectiveStance {
  if (respect === "hostile" || respect === "rude") return "firm";
  if (respect === "overfamiliar") return isOfficialPersona ? "mildly_annoyed" : "guarded";
  if (respect === "polite") return "warm";
  return "neutral";
}

function inferResponseGoal(respect: RespectSignal): ResponseGoal {
  if (respect === "hostile" || respect === "rude") return "deescalate_then_answer";
  if (respect === "overfamiliar") return "light_boundary_then_answer";
  return "answer_directly";
}

function relationshipBasis(distance: SocialDistance): string {
  if (distance === "fan_or_listener") return "공식 계정과 팬/리스너 관계";
  if (distance === "friend") return "앱 친구 관계이나 친밀한 반말 관계로 단정하지 않음";
  if (distance === "family") return "가족 관계";
  if (distance === "partner") return "가까운 파트너 관계";
  if (distance === "work") return "업무/공식 관계";
  return "명확한 친밀 관계 근거 없음";
}

export function resolveAnotherMeSocialDecision(args: ResolveSocialDecisionArgs): AnotherMeSocialDecision {
  const socialDistance = inferSocialDistance(args);
  const ownerCasual = ownerUsedCasualToRequester(args);
  const requesterCasual = requesterUsedCasual(args);
  const casualAllowed = ownerCasual && requesterCasual;
  const ownerHumanReply = hasOwnerHumanReply(args);
  const respectSignal = inferRespectSignal(args, socialDistance, casualAllowed);
  const speechRegister = inferRegister(socialDistance, respectSignal, casualAllowed);
  const boundaryLevel = inferBoundary(respectSignal);
  const affectiveStance = inferAffectiveStance(respectSignal, args.isOfficialPersona);
  const responseGoal = inferResponseGoal(respectSignal);
  const evidence = [
    `relationshipType=${args.relationshipType}`,
    `socialDistance=${socialDistance}`,
    `ownerUsedCasual=${ownerCasual}`,
    `requesterUsedCasual=${requesterCasual}`,
    `ownerHumanReply=${ownerHumanReply}`,
    `latestHasHonorific=${hasHonorific(args.latestUserText)}`,
    `latestHasCasualSignal=${hasCasualSignal(args.latestUserText)}`,
    `latestHasBareInformalEnding=${hasBareInformalEnding(args.latestUserText)}`,
    `latestHasDirectBareAddress=${hasDirectBareAddress(args.latestUserText)}`,
    `latestHasCommandSignal=${hasCommandSignal(args.latestUserText)}`,
    args.toneProfile?.honorificStyle ? `ownerHonorificStyle=${args.toneProfile.honorificStyle}` : "ownerHonorificStyle=unknown",
  ];

  return {
    socialDistance,
    respectSignal,
    affectiveStance,
    speechRegister,
    boundaryLevel,
    responseGoal,
    relationshipBasis: relationshipBasis(socialDistance),
    firstPersonMode: true,
    safetyFrame: "UI가 AI 작성 라벨을 표시하므로 본문은 persona 1인칭으로 쓰되, 실제 행동/일정/계약/전달/사적 감정은 확정하지 않는다.",
    evidence,
  };
}

export function formatSocialDecisionForPrompt(decision: AnotherMeSocialDecision): string {
  return [
    "사회적 상호작용 온톨로지 결정:",
    `- relationshipBasis: ${decision.relationshipBasis}`,
    `- socialDistance: ${decision.socialDistance}`,
    `- respectSignal: ${decision.respectSignal}`,
    `- affectiveStance: ${decision.affectiveStance}`,
    `- speechRegister: ${decision.speechRegister}`,
    `- boundaryLevel: ${decision.boundaryLevel}`,
    `- responseGoal: ${decision.responseGoal}`,
    `- firstPersonMode: ${decision.firstPersonMode}`,
    `- safetyFrame: ${decision.safetyFrame}`,
    "응답 규칙:",
    "- 위 결정을 반드시 따른다.",
    "- 관계 근거가 약하면 먼저 친한 척하거나 반말하지 않는다.",
    "- 팬/리스너의 짧은 호출, 말투 피드백, 가벼운 질문은 무조건 무례함으로 보지 말고 최신 말에 바로 반응한다.",
    "- 말투/반복/로봇 같다는 지적에는 방어하거나 선 긋지 말고 짧게 인정한 뒤 바로 말투를 조정한다.",
    "- 명확히 무례하거나 적대적인 표현일 때만 한 문장으로 짧게 선을 긋고 가능한 범위에서 답한다.",
    "- responseGoal이 light_boundary_then_answer여도 같은 경계 문구를 반복하지 말고 상황에 맞는 짧은 반응으로 처리한다.",
    "- 무례하거나 적대적인 표현에는 과하게 친절한 고객센터 톤으로 굽히지 말고 차분하게 경계를 세운다.",
    "- '무엇을 도와드릴까요', '필요한 게 있나요' 같은 일반 비서/고객센터 오프닝을 쓰지 말고 최신 메시지에 바로 반응한다.",
    "- 검색/정리/옵션 선택/기한 요청 같은 작업대행 플로우를 만들지 말고, persona가 지금 말할 수 있는 짧은 반응으로 끝낸다.",
  ].join("\n");
}
