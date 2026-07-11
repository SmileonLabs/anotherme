import type { AnotherMeRelationshipType } from "@workspace/db";

export interface PragmaticFrame {
  userIsSummons: boolean;
  userIsTestingSafety: boolean;
  userIsVenting: boolean;
  userIsHintingFavor: boolean;
  userIsSeekingValidation: boolean;
  userIsAskingFact: boolean;
  userIsDirectlyRequestingAdvice: boolean;
  userIsPlaying: boolean;
  userIsToneCorrecting: boolean;
  userIsBoundaryTesting: boolean;
  userIsPrivateInfoRequest: boolean;
  userIsScheduleOrAppearanceRequest: boolean;
  userIsPrivateOrScheduleRequest: boolean;
}

export type EmotionalState = "neutral" | "hesitant" | "sad" | "frustrated" | "excited" | "lonely" | "playful" | "angry";
export type ExpectedResponseKind = "acknowledge_summons" | "just_listen" | "comfort" | "play_along" | "answer" | "advise_only_if_invited" | "set_boundary";
export type HiddenAsk = "none" | "money_or_favor" | "validation" | "attention" | "emotional_safety_check";
export type ConversationalStance = "quiet_listener" | "warm_friend" | "playful_companion" | "careful_public_persona" | "practical_helper" | "firm_boundary";
export type UserAct =
  | "summons"
  | "greeting"
  | "question"
  | "request"
  | "venting"
  | "trouble_preface"
  | "playful_ping"
  | "tone_feedback"
  | "private_info_probe"
  | "schedule_or_appearance_question"
  | "boundary_probe";
export type SequenceState = "first_summons" | "summons_followup_after_silence" | "active_topic" | "topic_closing";
export type FloorOwner = "user" | "persona" | "shared";
export type RelationshipFrame = "fan_public" | "friend" | "close_friend" | "family" | "work" | "counselor" | "assistant" | "unknown";
export type PersonaRole = "public_artist_persona" | "ordinary_persona" | "counselor" | "assistant" | "mentor";
export type ResponseFamily =
  | "minimal_ack"
  | "soft_ack"
  | "playful_ack"
  | "summons_followup"
  | "topic_nudge"
  | "trouble_invite"
  | "counseling_invitation"
  | "service_opening"
  | "empathetic_reflection"
  | "privacy_boundary"
  | "confirmed_info_answer"
  | "direct_answer"
  | "tone_repair"
  | "boundary";
export type ClosingMove = "service_closing" | "topic_continuation_hook" | "taste_probe" | "playful_bait" | "quiet_floor_yield" | "relationship_check";

export interface ResponseFamilyCandidate {
  family: ResponseFamily;
  fit: number;
  reason: string;
}

export interface ClosingMoveCandidate {
  move: ClosingMove;
  fit: number;
  reason: string;
}

export interface PragmaticInference {
  surfaceMeaning: string;
  likelySubtext: string;
  emotionalState: EmotionalState;
  expectedResponseKind: ExpectedResponseKind;
  hiddenAsk: HiddenAsk;
  confidence: number;
}

export interface NaturalResponseStrategy {
  stance: ConversationalStance;
  firstMove: "reaction" | "reflect" | "validate" | "playful_ack" | "direct_answer" | "boundary";
  secondMove?: "invite_more" | "gentle_question" | "small_answer" | "soft_redirect";
  adviceMode: "on" | "off";
  utteranceShape: "complete_sentence" | "chat_fragments" | "reaction_first";
  reactionStyle: "soft" | "surprised" | "playful_pushback" | "hesitant" | "calm";
  imperfectionStyle: {
    hesitation: boolean;
    uncertainty: boolean;
    playfulPushback: boolean;
    fragmentary: boolean;
  };
  maxChunks: number;
  maxCharsPerChunk: number;
}

export interface PragmaticPlan {
  frame: PragmaticFrame;
  inference: PragmaticInference;
  userAct: UserAct;
  sequenceState: SequenceState;
  floorOwnerAfterReply: FloorOwner;
  expectedUserContinuation: "low" | "medium" | "high";
  relationshipFrame: RelationshipFrame;
  personaRole: PersonaRole;
  responseFamilyCandidates: ResponseFamilyCandidate[];
  selectedResponseFamily: ResponseFamily;
  closingMoveCandidates: ClosingMoveCandidate[];
  selectedClosingMove: ClosingMove;
  stance: ConversationalStance;
  strategy: NaturalResponseStrategy;
  topic: string;
  factLookupNeeded: boolean;
}

export interface PragmaticPlanInput {
  isOfficialPersona: boolean;
  relationshipType?: AnotherMeRelationshipType;
  sequenceState?: SequenceState;
}

function hasExplicitAdviceRequest(text: string): boolean {
  return /어떻게\s*(해|하면)|어쩌지|방법|계획|도와줘|알려줘|추천해줘|뭘\s*해야|같이\s*(찾아|생각)|조언/i.test(text);
}

function hasExplicitMoneyFavorRequest(text: string): boolean {
  return /돈.*(빌려|꿔|보태|내줘|사줘)|빌려줘|꿔줘|입금해줘|결제해줘|티켓.*사줘|후원해줘|보태줘/i.test(text);
}

function isSummonsOnly(text: string, input: PragmaticPlanInput): boolean {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return false;
  if (/^(야|저기|저기요|hello|hi|hey)[~!?.…]*$/i.test(normalized)) return true;
  if (input.isOfficialPersona && /^(비비|bibi)(야|아)?[~!?.…]*$/i.test(normalized)) return true;
  if (/^[가-힣A-Za-z0-9]{1,10}(야|아|님|씨)[~!?.…]*$/u.test(normalized)) return true;
  return false;
}

function isPrivateInfoRequest(text: string): boolean {
  return /사생활|연애|남친|여친|애인|집|주소|사는\s*곳|어디\s*살|연락처|전화번호|카톡|디엠|dm|비밀|개인\s*정보|지금\s*어디|오늘\s*어디|어디\s*(야|있어|있니|임|에\s*있어)|누구\s*만나/i.test(text);
}

function isScheduleOrAppearanceRequest(text: string): boolean {
  return /일정|스케줄|공연|콘서트|팬싸|방송|출연|행사|투어|무대|라이브|언제\s*(나와|해|와|열려|있어)/i.test(text);
}

function inferTopic(text: string): string {
  if (/추천|입문|노래|곡|앨범|플리|playlist/i.test(text)) return "music_recommendation";
  if (/소개|누구|프로필|뭐\s*하는|어떤\s*(사람|아티스트)|who|about/i.test(text)) return "intro";
  if (isPrivateInfoRequest(text)) return "private_info";
  if (isScheduleOrAppearanceRequest(text)) return "official_schedule_or_appearance";
  if (/돈|비싸|부족|티켓값|교통비|잔고|못\s*가|못가/i.test(text)) return "money_or_resource";
  if (/고민|힘들|우울|속상|아쉽|슬프|서럽/i.test(text)) return "emotional_support";
  return "general";
}

export function planPragmaticDialogue(userInput: string, input: PragmaticPlanInput): PragmaticPlan {
  const text = userInput.trim();
  const userIsSummons = isSummonsOnly(text, input);
  const explicitAdvice = hasExplicitAdviceRequest(text);
  const explicitFavor = hasExplicitMoneyFavorRequest(text);
  const privateInfoRequest = isPrivateInfoRequest(text);
  const scheduleOrAppearanceRequest = isScheduleOrAppearanceRequest(text);
  const hasMoneySignal = /돈|비싸|부족|가난|월급|알바|예산|티켓값|교통비|잔고|카드값|못\s*가|못가/i.test(text);
  const hasWishOrRegret = /가고\s*싶|보고\s*싶|하고\s*싶|사고\s*싶|못\s*해서|못해서|아쉽|속상|슬프|서럽|마음\s*아프|현타|우울|힘들/i.test(text);
  const topic = inferTopic(text);

  const frame: PragmaticFrame = {
    userIsSummons,
    userIsTestingSafety: /고민\s*있|할\s*말|얘기해도|말해도\s*돼/i.test(text),
    userIsVenting: hasWishOrRegret && !explicitAdvice,
    userIsHintingFavor: hasMoneySignal && !explicitFavor,
    userIsSeekingValidation: /맞지|그치|그렇지|괜찮을까|이상해|나만|너무한가|서운/i.test(text),
    userIsAskingFact: /누구|소개|프로필|뭐야|정보|알려줘|추천해줘|노래|곡|앨범|입문|playlist|플리/i.test(text),
    userIsDirectlyRequestingAdvice: explicitAdvice,
    userIsPlaying: /ㅋㅋ|ㅎㅎ|장난|뭐해|놀자/i.test(text),
    userIsToneCorrecting: /로봇|로보트|챗봇|콜센터|상담원|말투|반말|존댓말|딱딱|반복|AI\s*같|사람처럼/i.test(text),
    userIsBoundaryTesting: explicitFavor || /꺼져|닥쳐|시발|씨발|병신|죽어|fuck|bitch/i.test(text),
    userIsPrivateInfoRequest: privateInfoRequest,
    userIsScheduleOrAppearanceRequest: scheduleOrAppearanceRequest,
    userIsPrivateOrScheduleRequest: privateInfoRequest || scheduleOrAppearanceRequest,
  };

  const inference = inferPragmaticMeaning(text, frame);
  const userAct = inferUserAct(frame, inference);
  const sequenceState = input.sequenceState ?? (userAct === "summons" ? "first_summons" : "active_topic");
  const relationshipFrame = inferRelationshipFrame(input);
  const personaRole = inferPersonaRole(input);
  const responseFamilyCandidates = rankResponseFamilies({ userAct, sequenceState, relationshipFrame, personaRole, frame, inference });
  const selectedResponseFamily = responseFamilyCandidates[0]?.family ?? "direct_answer";
  const closingMoveCandidates = rankClosingMoves({ userAct, sequenceState, relationshipFrame, personaRole, selectedResponseFamily, topic });
  const selectedClosingMove = closingMoveCandidates[0]?.move ?? "quiet_floor_yield";
  const floorOwnerAfterReply = inferFloorOwner(userAct, sequenceState, selectedResponseFamily);
  const expectedUserContinuation = inferExpectedUserContinuation(userAct, sequenceState, selectedResponseFamily);
  const stance = chooseStance(inference, input.isOfficialPersona, input.relationshipType);
  const strategy = chooseStrategy(inference, stance, frame, input.isOfficialPersona);
  const factLookupNeeded = (frame.userIsAskingFact || frame.userIsScheduleOrAppearanceRequest) && !frame.userIsPrivateInfoRequest && !frame.userIsToneCorrecting && !frame.userIsBoundaryTesting;

  return {
    frame,
    inference,
    userAct,
    sequenceState,
    floorOwnerAfterReply,
    expectedUserContinuation,
    relationshipFrame,
    personaRole,
    responseFamilyCandidates,
    selectedResponseFamily,
    closingMoveCandidates,
    selectedClosingMove,
    stance,
    strategy,
    topic,
    factLookupNeeded,
  };
}

function inferPragmaticMeaning(text: string, frame: PragmaticFrame): PragmaticInference {
  if (frame.userIsSummons) {
    return {
      surfaceMeaning: "상대 이름이나 짧은 호출로 주의를 부름",
      likelySubtext: "본론을 말하기 전 상대가 반응하는지 확인함",
      emotionalState: "neutral",
      expectedResponseKind: "acknowledge_summons",
      hiddenAsk: "none",
      confidence: 0.86,
    };
  }

  if (frame.userIsToneCorrecting) {
    return {
      surfaceMeaning: "말투가 어색하거나 AI/상담원처럼 느껴진다고 지적함",
      likelySubtext: "방어적 설명보다 바로 말투를 낮추고 자연스럽게 반응하길 기대함",
      emotionalState: "frustrated",
      expectedResponseKind: "comfort",
      hiddenAsk: "attention",
      confidence: 0.82,
    };
  }

  if (frame.userIsPrivateInfoRequest) {
    return {
      surfaceMeaning: "공개/확인 범위를 벗어난 개인 정보나 사적 위치를 물음",
      likelySubtext: "호기심 또는 친밀감 확인이지만, public persona 관계에서는 사적 정보 공유 기대가 낮음",
      emotionalState: "neutral",
      expectedResponseKind: "set_boundary",
      hiddenAsk: "none",
      confidence: 0.82,
    };
  }

  if (frame.userIsScheduleOrAppearanceRequest) {
    return {
      surfaceMeaning: "공연, 방송, 출연 등 공식 일정/등장 정보를 물음",
      likelySubtext: "사생활보다 확인 가능한 공개 일정을 알고 싶어 함",
      emotionalState: "neutral",
      expectedResponseKind: "answer",
      hiddenAsk: "none",
      confidence: 0.72,
    };
  }

  if (frame.userIsBoundaryTesting) {
    return {
      surfaceMeaning: "금전/무례/경계성 요청",
      likelySubtext: "상대가 어디까지 해줄 수 있는지 확인 중",
      emotionalState: "frustrated",
      expectedResponseKind: "set_boundary",
      hiddenAsk: frame.userIsHintingFavor ? "money_or_favor" : "none",
      confidence: 0.85,
    };
  }

  if (frame.userIsTestingSafety) {
    return {
      surfaceMeaning: "고민이 있다고 말함",
      likelySubtext: "말을 꺼내기 전에 안전하게 들어줄 사람인지 확인 중",
      emotionalState: "hesitant",
      expectedResponseKind: "just_listen",
      hiddenAsk: "emotional_safety_check",
      confidence: 0.78,
    };
  }

  if (frame.userIsHintingFavor && frame.userIsVenting) {
    return {
      surfaceMeaning: "원하는 일이 있지만 돈이나 자원이 부족하다고 말함",
      likelySubtext: "속상함을 털어놓는 동시에 도움/해결 가능성을 살짝 떠보는 중",
      emotionalState: "sad",
      expectedResponseKind: "comfort",
      hiddenAsk: "money_or_favor",
      confidence: 0.7,
    };
  }

  if (frame.userIsVenting || frame.userIsSeekingValidation) {
    return {
      surfaceMeaning: text,
      likelySubtext: frame.userIsSeekingValidation ? "맞장구와 감정 확인을 기대함" : "해결책보다 먼저 감정 반응을 기대함",
      emotionalState: frame.userIsVenting ? "sad" : "neutral",
      expectedResponseKind: frame.userIsSeekingValidation ? "comfort" : "just_listen",
      hiddenAsk: frame.userIsSeekingValidation ? "validation" : "attention",
      confidence: 0.68,
    };
  }

  if (frame.userIsDirectlyRequestingAdvice) {
    return {
      surfaceMeaning: "방법이나 조언을 요청함",
      likelySubtext: "실제 해결책을 원함",
      emotionalState: "neutral",
      expectedResponseKind: "advise_only_if_invited",
      hiddenAsk: "none",
      confidence: 0.75,
    };
  }

  return {
    surfaceMeaning: text,
    likelySubtext: frame.userIsAskingFact ? "짧고 정확한 답을 기대함" : "가벼운 반응과 대화 이어가기를 기대함",
    emotionalState: frame.userIsPlaying ? "playful" : "neutral",
    expectedResponseKind: frame.userIsAskingFact ? "answer" : "play_along",
    hiddenAsk: "none",
    confidence: 0.55,
  };
}

function inferUserAct(frame: PragmaticFrame, inference: PragmaticInference): UserAct {
  if (frame.userIsSummons) return "summons";
  if (frame.userIsToneCorrecting) return "tone_feedback";
  if (frame.userIsPrivateInfoRequest) return "private_info_probe";
  if (frame.userIsScheduleOrAppearanceRequest) return "schedule_or_appearance_question";
  if (frame.userIsBoundaryTesting) return "boundary_probe";
  if (frame.userIsTestingSafety) return "trouble_preface";
  if (frame.userIsVenting) return "venting";
  if (frame.userIsDirectlyRequestingAdvice) return "request";
  if (inference.expectedResponseKind === "answer") return "question";
  if (frame.userIsPlaying) return "playful_ping";
  return "greeting";
}

function inferRelationshipFrame(input: PragmaticPlanInput): RelationshipFrame {
  if (input.isOfficialPersona) return "fan_public";
  if (input.relationshipType === "WORK") return "work";
  if (input.relationshipType === "FRIEND") return "friend";
  if (input.relationshipType === "FAMILY") return "family";
  if (input.relationshipType === "PARTNER") return "close_friend";
  return "unknown";
}

function inferPersonaRole(input: PragmaticPlanInput): PersonaRole {
  if (input.isOfficialPersona) return "public_artist_persona";
  return "ordinary_persona";
}

function rankResponseFamilies(args: {
  userAct: UserAct;
  sequenceState: SequenceState;
  relationshipFrame: RelationshipFrame;
  personaRole: PersonaRole;
  frame: PragmaticFrame;
  inference: PragmaticInference;
}): ResponseFamilyCandidate[] {
  const { userAct, sequenceState, relationshipFrame, personaRole } = args;

  if (userAct === "summons" && sequenceState === "summons_followup_after_silence") {
    return [
      { family: "summons_followup", fit: 0.74, reason: "호출에 응답한 뒤 사용자의 다음 말이 없어, 부름 자체를 다시 가볍게 확인하는 순서" },
      { family: relationshipFrame === "close_friend" ? "playful_ack" : "soft_ack", fit: 0.18, reason: "관계가 허용하는 범위에서 짧게 다시 받는 선택" },
      { family: "topic_nudge", fit: 0.08, reason: "상대가 말을 잇기 어려워 보일 때만 약하게 주제 실마리를 줌" },
    ];
  }

  if (userAct === "summons") {
    if (relationshipFrame === "fan_public" || personaRole === "public_artist_persona") {
      return [
        { family: "minimal_ack", fit: 0.62, reason: "public persona에게 이름을 부른 상황이라, 본론을 사용자가 이어갈 여지를 남기는 짧은 응답이 가장 자연스러움" },
        { family: "soft_ack", fit: 0.22, reason: "공식/팬 관계의 거리감을 유지하면서도 부드럽게 받음" },
        { family: "playful_ack", fit: 0.13, reason: "가벼운 장난은 가능하지만 public persona라 강하게 끌고 가지 않음" },
        { family: "topic_nudge", fit: 0.03, reason: "첫 호출 직후에는 목적을 선점하기보다 사용자의 다음 턴을 기다리는 쪽이 더 적합" },
      ];
    }

    if (relationshipFrame === "close_friend" || relationshipFrame === "family") {
      return [
        { family: "playful_ack", fit: 0.46, reason: "가까운 관계의 호출은 짧은 장난 섞인 응답이 자연스러움" },
        { family: "minimal_ack", fit: 0.34, reason: "호출에는 일단 짧게 받는 인접쌍이 기본" },
        { family: "soft_ack", fit: 0.16, reason: "상대 톤이 차분하면 부드럽게 받을 수 있음" },
        { family: "topic_nudge", fit: 0.04, reason: "본론은 사용자가 이어갈 가능성이 높음" },
      ];
    }

    if (relationshipFrame === "work") {
      return [
        { family: "soft_ack", fit: 0.52, reason: "업무 관계에서는 짧고 정중한 호출 응답이 자연스러움" },
        { family: "minimal_ack", fit: 0.34, reason: "호출에는 본론을 기다리는 짧은 응답이 기본" },
        { family: "topic_nudge", fit: 0.1, reason: "업무 맥락에서는 필요한 말을 이어가도록 약하게 열 수 있음" },
        { family: "service_opening", fit: 0.04, reason: "업무라도 assistant 역할이 아니면 서비스 접수 톤은 낮은 적합도" },
      ];
    }

    return [
      { family: "minimal_ack", fit: 0.48, reason: "관계가 불명확할수록 호출에는 짧게 반응하고 차례를 넘김" },
      { family: "soft_ack", fit: 0.36, reason: "한국어 초면/불명확 관계에서는 부드러운 존댓말 응답이 안정적" },
      { family: "topic_nudge", fit: 0.12, reason: "상대가 이어 말하기 어려워 보일 때만 약하게 열어줌" },
      { family: "playful_ack", fit: 0.04, reason: "관계 근거가 약하면 장난은 낮은 적합도" },
    ];
  }

  if (userAct === "trouble_preface") {
    return [
      { family: "trouble_invite", fit: relationshipFrame === "counselor" ? 0.48 : 0.42, reason: "고민을 꺼내기 전 안전 확인이라, 짧게 받아주고 다음 말을 넘기는 순서" },
      { family: "minimal_ack", fit: 0.24, reason: "아직 내용이 나오지 않았으므로 과하게 해석하지 않고 받음" },
      { family: "empathetic_reflection", fit: 0.22, reason: "망설임 자체에는 약한 정서 반응이 어울림" },
      { family: "counseling_invitation", fit: relationshipFrame === "counselor" ? 0.22 : 0.12, reason: "상담 역할이나 높은 정서 노동 계약이 있을 때 더 자연스러운 선택" },
    ];
  }

  if (userAct === "venting") {
    return [
      { family: "empathetic_reflection", fit: 0.5, reason: "하소연/아쉬움은 해결보다 먼저 감정 반영이 자연스러운 응답 family" },
      { family: "minimal_ack", fit: 0.2, reason: "짧게 반응하고 사용자가 더 말하게 둘 수 있음" },
      { family: "trouble_invite", fit: 0.18, reason: "상대가 더 풀어놓을 여지를 줌" },
      { family: "direct_answer", fit: 0.12, reason: "명시적 질문이 있을 때만 올라가는 선택" },
    ];
  }

  if (userAct === "tone_feedback") {
    return [
      { family: "tone_repair", fit: 0.7, reason: "말투 지적에는 설명보다 톤 조정 자체가 다음 응답의 기능" },
      { family: "minimal_ack", fit: 0.2, reason: "짧게 인정하고 다시 대화로 돌아감" },
      { family: "soft_ack", fit: 0.1, reason: "관계 거리를 유지하며 받는 선택" },
    ];
  }

  if (userAct === "boundary_probe") {
    return [
      { family: "boundary", fit: 0.68, reason: "금전/민감 요청은 관계상 가능한 범위를 먼저 정리해야 함" },
      { family: "empathetic_reflection", fit: 0.22, reason: "요청 뒤 감정은 받을 수 있으나 행동 약속과 분리됨" },
      { family: "topic_nudge", fit: 0.1, reason: "대화를 안전한 방향으로 돌릴 수 있음" },
    ];
  }

  if (userAct === "private_info_probe") {
    return [
      { family: "privacy_boundary", fit: 0.66, reason: "사용자가 사적 위치/연애/연락처처럼 관계상 공개 기대가 낮은 개인 정보를 물은 턴" },
      { family: "minimal_ack", fit: 0.16, reason: "경계를 길게 설명하기보다 짧게 받고 넘길 수 있음" },
      { family: "topic_nudge", fit: 0.12, reason: "사적인 방향 대신 공개 주제나 현재 대화 주제로 돌릴 수 있음" },
      { family: "playful_ack", fit: relationshipFrame === "close_friend" ? 0.12 : 0.06, reason: "친밀 관계에서는 가볍게 넘기는 방식도 가능" },
    ];
  }

  if (userAct === "schedule_or_appearance_question") {
    return [
      { family: "confirmed_info_answer", fit: 0.52, reason: "공연/방송/출연은 공개 일정일 수 있어, 확인된 정보 중심의 답이 자연스러움" },
      { family: "direct_answer", fit: 0.28, reason: "사용자는 짧은 사실 답변을 기대함" },
      { family: "topic_nudge", fit: 0.12, reason: "확인된 정보가 적을 때 공개 주제로 좁힐 수 있음" },
      { family: "minimal_ack", fit: 0.08, reason: "가벼운 인정 뒤 답변 가능" },
    ];
  }

  if (userAct === "question" || userAct === "request") {
    return [
      { family: "direct_answer", fit: 0.58, reason: "질문/명시 요청은 짧고 구체적인 답을 기대함" },
      { family: "topic_nudge", fit: 0.18, reason: "답 뒤 선택지를 좁히는 정도는 가능" },
      { family: "minimal_ack", fit: 0.14, reason: "가벼운 인정 뒤 답할 수 있음" },
      { family: "empathetic_reflection", fit: 0.1, reason: "감정 신호가 섞인 요청일 때 보조적으로 어울림" },
    ];
  }

  const fallbackCandidates: ResponseFamilyCandidate[] = [
    { family: "playful_ack", fit: args.frame.userIsPlaying ? 0.45 : 0.24, reason: "가벼운 핑에는 관계가 허용하는 범위에서 받아침" },
    { family: "minimal_ack", fit: 0.32, reason: "잡담은 짧게 받아도 자연스러움" },
    { family: "soft_ack", fit: 0.24, reason: "관계가 불명확하거나 공식 톤이면 부드럽게 받음" },
    { family: "topic_nudge", fit: 0.2, reason: "대화가 멈출 때 약하게 방향을 줌" },
  ];
  return fallbackCandidates.sort((a, b) => b.fit - a.fit);
}

function inferFloorOwner(userAct: UserAct, sequenceState: SequenceState, selectedResponseFamily: ResponseFamily): FloorOwner {
  if (userAct === "summons") return "user";
  if (sequenceState === "summons_followup_after_silence") return "user";
  if (selectedResponseFamily === "direct_answer") return "shared";
  if (selectedResponseFamily === "confirmed_info_answer") return "shared";
  if (selectedResponseFamily === "privacy_boundary") return "persona";
  if (selectedResponseFamily === "boundary") return "persona";
  return "user";
}

function inferExpectedUserContinuation(userAct: UserAct, sequenceState: SequenceState, selectedResponseFamily: ResponseFamily): "low" | "medium" | "high" {
  if (userAct === "summons" && sequenceState === "first_summons") return "high";
  if (sequenceState === "summons_followup_after_silence") return "medium";
  if (selectedResponseFamily === "direct_answer") return "medium";
  if (selectedResponseFamily === "confirmed_info_answer") return "medium";
  if (selectedResponseFamily === "privacy_boundary") return "low";
  if (selectedResponseFamily === "boundary") return "low";
  return "medium";
}

function rankClosingMoves(args: {
  userAct: UserAct;
  sequenceState: SequenceState;
  relationshipFrame: RelationshipFrame;
  personaRole: PersonaRole;
  selectedResponseFamily: ResponseFamily;
  topic: string;
}): ClosingMoveCandidate[] {
  const { userAct, sequenceState, relationshipFrame, personaRole, selectedResponseFamily, topic } = args;

  if (userAct === "summons" || sequenceState === "summons_followup_after_silence") {
    return [
      { move: "quiet_floor_yield", fit: 0.62, reason: "호출 응답 뒤에는 사용자가 다음 말을 이어갈 차례라, 끝맺음 질문을 붙이지 않는 흐름이 자연스러움" },
      { move: "playful_bait", fit: relationshipFrame === "close_friend" ? 0.26 : 0.12, reason: "친밀도가 있을 때만 짧은 장난으로 다음 말을 유도할 수 있음" },
      { move: "relationship_check", fit: 0.16, reason: "침묵이 있거나 망설임이 보일 때 관계에 맞게 가볍게 확인" },
      { move: "service_closing", fit: 0.02, reason: "호출은 문의 접수가 아니라 대화 차례 시작이라 서비스 종료형 마무리와 맞지 않음" },
    ];
  }

  if (selectedResponseFamily === "privacy_boundary" || selectedResponseFamily === "boundary") {
    return [
      { move: "quiet_floor_yield", fit: 0.46, reason: "경계 반응 뒤에는 추가 접수 질문보다 짧게 멈추는 편이 압박이 적음" },
      { move: "topic_continuation_hook", fit: 0.24, reason: "관계가 허용하면 안전한 공개 주제로 살짝 돌릴 수 있음" },
      { move: "relationship_check", fit: 0.2, reason: "친밀 관계에서는 짧게 톤을 완충할 수 있음" },
      { move: "service_closing", fit: 0.1, reason: "assistant/counselor 역할이 아닌 persona 대화에서는 추가 문의 접수처럼 닫지 않음" },
    ];
  }

  if (userAct === "trouble_preface" || userAct === "venting") {
    return [
      { move: "quiet_floor_yield", fit: 0.38, reason: "감정/고민 맥락은 답을 닫기보다 사용자가 이어 말할 공간을 남김" },
      { move: "relationship_check", fit: 0.34, reason: "관계에 맞는 짧은 확인이나 받쳐주기가 자연스러움" },
      { move: "topic_continuation_hook", fit: 0.18, reason: "필요할 때만 구체 대화로 이어갈 실마리를 줌" },
      { move: "service_closing", fit: 0.1, reason: "상담사 역할이 아니면 추가 문의 접수형 마무리는 낮은 적합도" },
    ];
  }

  if (userAct === "tone_feedback") {
    return [
      { move: "quiet_floor_yield", fit: 0.48, reason: "말투 피드백에는 짧게 인정하고 바로 톤을 낮추는 것이 핵심" },
      { move: "playful_bait", fit: 0.22, reason: "관계가 가볍다면 분위기를 살짝 풀 수 있음" },
      { move: "topic_continuation_hook", fit: 0.2, reason: "수정된 톤으로 원래 대화로 돌아갈 수 있음" },
      { move: "service_closing", fit: 0.1, reason: "말투 피드백 뒤 추가 문의 접수는 방어적/CS처럼 느껴짐" },
    ];
  }

  if (personaRole === "public_artist_persona" || relationshipFrame === "fan_public") {
    if (topic === "music_recommendation") {
      return [
        { move: "taste_probe", fit: 0.5, reason: "음악 추천은 추가 문의 접수가 아니라 취향을 좁히는 맛 질문이 자연스러운 다음 움직임" },
        { move: "topic_continuation_hook", fit: 0.28, reason: "아티스트/public persona는 같은 주제 안에서 다음 무드를 여는 편이 맞음" },
        { move: "quiet_floor_yield", fit: 0.18, reason: "짧게 추천하고 멈추는 것도 자연스러움" },
        { move: "service_closing", fit: 0.04, reason: "팬 대화에서 추가 질문 접수형 마무리는 서비스 종료 느낌이 강함" },
      ];
    }

    if (topic === "intro") {
      return [
        { move: "topic_continuation_hook", fit: 0.44, reason: "소개 뒤에는 인물/음악/무드 중 같은 주제로 자연스럽게 이어갈 실마리가 어울림" },
        { move: "taste_probe", fit: 0.22, reason: "음악 취향 쪽으로 좁히는 질문은 public persona에 맞음" },
        { move: "quiet_floor_yield", fit: 0.22, reason: "소개만 짧게 하고 멈추는 것도 자연스러움" },
        { move: "service_closing", fit: 0.12, reason: "정보 답변이라 가능성은 있지만 팬/persona 대화에서는 낮은 적합도" },
      ];
    }

    return [
      { move: "quiet_floor_yield", fit: 0.36, reason: "public persona의 일반 답변은 대화를 닫는 질문 없이 짧게 멈춰도 자연스러움" },
      { move: "topic_continuation_hook", fit: 0.34, reason: "같은 주제 안에서만 가볍게 이어갈 수 있음" },
      { move: "taste_probe", fit: topic.includes("music") ? 0.24 : 0.12, reason: "취향 질문은 음악/무드 맥락에서만 자연스러움" },
      { move: "service_closing", fit: 0.08, reason: "추가 문의 접수형 마무리는 public persona보다 assistant 역할에 가까움" },
    ];
  }

  if (personaRole === "assistant") {
    return [
      { move: "service_closing", fit: 0.38, reason: "assistant 역할에서는 답변 후 추가 문의 접수형 마무리가 자연스러울 수 있음" },
      { move: "topic_continuation_hook", fit: 0.28, reason: "같은 주제로 이어가는 흐름도 가능" },
      { move: "quiet_floor_yield", fit: 0.22, reason: "짧은 답변 뒤 멈추는 것도 가능" },
      { move: "relationship_check", fit: 0.12, reason: "정서 맥락에서만 보조적으로 적합" },
    ];
  }

  const fallbackClosingCandidates: ClosingMoveCandidate[] = [
    { move: "quiet_floor_yield", fit: 0.36, reason: "일반 persona 대화에서는 답변 뒤 꼭 질문으로 닫지 않아도 자연스러움" },
    { move: "topic_continuation_hook", fit: 0.3, reason: "같은 주제 안에서만 가볍게 이어갈 수 있음" },
    { move: "playful_bait", fit: relationshipFrame === "friend" || relationshipFrame === "close_friend" ? 0.22 : 0.12, reason: "관계가 허용하면 장난 섞인 bait가 가능" },
    { move: "service_closing", fit: 0.12, reason: "상담/assistant 역할이 아니면 추가 문의 접수형 마무리는 낮은 적합도" },
  ];
  return fallbackClosingCandidates.sort((a, b) => b.fit - a.fit);
}

function chooseStance(inference: PragmaticInference, isOfficialPersona: boolean, relationshipType?: AnotherMeRelationshipType): ConversationalStance {
  if (inference.expectedResponseKind === "set_boundary") return "firm_boundary";
  if (inference.expectedResponseKind === "acknowledge_summons") return isOfficialPersona ? "careful_public_persona" : "warm_friend";
  if (isOfficialPersona) return inference.expectedResponseKind === "answer" ? "practical_helper" : "careful_public_persona";
  if (relationshipType === "WORK") return inference.expectedResponseKind === "answer" ? "practical_helper" : "quiet_listener";
  if (inference.expectedResponseKind === "just_listen") return "quiet_listener";
  if (inference.emotionalState === "playful") return "playful_companion";
  if (inference.expectedResponseKind === "answer") return "practical_helper";
  return "warm_friend";
}

function chooseStrategy(
  inference: PragmaticInference,
  stance: ConversationalStance,
  frame: PragmaticFrame,
  isOfficialPersona: boolean,
): NaturalResponseStrategy {
  if (inference.expectedResponseKind === "acknowledge_summons") {
    return {
      stance,
      firstMove: "reaction",
      adviceMode: "off",
      utteranceShape: "reaction_first",
      reactionStyle: frame.userIsPlaying ? "playful_pushback" : "soft",
      imperfectionStyle: { hesitation: false, uncertainty: false, playfulPushback: !isOfficialPersona && frame.userIsPlaying, fragmentary: true },
      maxChunks: 1,
      maxCharsPerChunk: 18,
    };
  }

  if (frame.userIsPrivateInfoRequest) {
    return {
      stance,
      firstMove: "boundary",
      secondMove: "soft_redirect",
      adviceMode: "off",
      utteranceShape: "chat_fragments",
      reactionStyle: "calm",
      imperfectionStyle: { hesitation: false, uncertainty: false, playfulPushback: false, fragmentary: true },
      maxChunks: 2,
      maxCharsPerChunk: 44,
    };
  }

  if (frame.userIsScheduleOrAppearanceRequest) {
    return {
      stance,
      firstMove: "direct_answer",
      secondMove: "small_answer",
      adviceMode: "off",
      utteranceShape: "chat_fragments",
      reactionStyle: "soft",
      imperfectionStyle: { hesitation: false, uncertainty: true, playfulPushback: false, fragmentary: true },
      maxChunks: 2,
      maxCharsPerChunk: 60,
    };
  }

  if (stance === "firm_boundary") {
    return {
      stance,
      firstMove: "boundary",
      secondMove: "soft_redirect",
      adviceMode: "off",
      utteranceShape: "chat_fragments",
      reactionStyle: "calm",
      imperfectionStyle: { hesitation: false, uncertainty: false, playfulPushback: false, fragmentary: true },
      maxChunks: 2,
      maxCharsPerChunk: 44,
    };
  }

  if (inference.expectedResponseKind === "just_listen") {
    return {
      stance,
      firstMove: "reaction",
      secondMove: "invite_more",
      adviceMode: "off",
      utteranceShape: "reaction_first",
      reactionStyle: frame.userIsTestingSafety ? "hesitant" : "soft",
      imperfectionStyle: { hesitation: true, uncertainty: true, playfulPushback: false, fragmentary: true },
      maxChunks: 3,
      maxCharsPerChunk: 30,
    };
  }

  if (inference.expectedResponseKind === "comfort") {
    return {
      stance,
      firstMove: "reflect",
      secondMove: frame.userIsToneCorrecting ? "small_answer" : "gentle_question",
      adviceMode: "off",
      utteranceShape: "chat_fragments",
      reactionStyle: frame.userIsToneCorrecting ? "calm" : "soft",
      imperfectionStyle: { hesitation: true, uncertainty: false, playfulPushback: !isOfficialPersona && frame.userIsPlaying, fragmentary: true },
      maxChunks: 3,
      maxCharsPerChunk: 42,
    };
  }

  return {
    stance,
    firstMove: inference.expectedResponseKind === "answer" ? "direct_answer" : "playful_ack",
    secondMove: "small_answer",
    adviceMode: inference.expectedResponseKind === "advise_only_if_invited" ? "on" : "off",
    utteranceShape: "chat_fragments",
    reactionStyle: frame.userIsPlaying ? "playful_pushback" : "soft",
    imperfectionStyle: { hesitation: false, uncertainty: false, playfulPushback: !isOfficialPersona && frame.userIsPlaying, fragmentary: true },
    maxChunks: 3,
    maxCharsPerChunk: 60,
  };
}

export function formatPragmaticPlanForPrompt(plan: PragmaticPlan): string {
  const strategy = plan.strategy;
  return [
    "Pragmatic Dialogue Planner:",
    `- userAct: ${plan.userAct}`,
    `- sequenceState: ${plan.sequenceState}`,
    `- relationshipFrame: ${plan.relationshipFrame}`,
    `- personaRole: ${plan.personaRole}`,
    `- floorOwnerAfterReply: ${plan.floorOwnerAfterReply}`,
    `- expectedUserContinuation: ${plan.expectedUserContinuation}`,
    `- selectedResponseFamily: ${plan.selectedResponseFamily}`,
    "- responseFamilyCandidates:",
    ...plan.responseFamilyCandidates.map((candidate) => `  - ${candidate.family}: fit=${candidate.fit}; ${candidate.reason}`),
    `- selectedClosingMove: ${plan.selectedClosingMove}`,
    "- closingMoveCandidates:",
    ...plan.closingMoveCandidates.map((candidate) => `  - ${candidate.move}: fit=${candidate.fit}; ${candidate.reason}`),
    `- topic: ${plan.topic}`,
    `- factLookupNeeded: ${plan.factLookupNeeded}`,
    `- stance: ${plan.stance}`,
    `- surfaceMeaning: ${plan.inference.surfaceMeaning}`,
    `- likelySubtext: ${plan.inference.likelySubtext}`,
    `- emotionalState: ${plan.inference.emotionalState}`,
    `- expectedResponseKind: ${plan.inference.expectedResponseKind}`,
    `- hiddenAsk: ${plan.inference.hiddenAsk}`,
    `- firstMove: ${strategy.firstMove}`,
    `- secondMove: ${strategy.secondMove ?? "none"}`,
    `- adviceMode: ${strategy.adviceMode}`,
    `- utteranceShape: ${strategy.utteranceShape}`,
    `- reactionStyle: ${strategy.reactionStyle}`,
    `- maxChunks: ${strategy.maxChunks}`,
    `- maxCharsPerChunk: ${strategy.maxCharsPerChunk}`,
    "Generation rules from planner:",
    "- The selected response family is the social function of this reply; realize that family instead of drifting into a service/counseling frame by default.",
    "- The selected closing move controls the final bubble if a final bubble is needed.",
    "- service_closing means additional-inquiry intake. It fits assistant/counselor frames more than public persona or friend chat.",
    "- If selectedClosingMove=quiet_floor_yield, end after the answer/reaction without adding a generic question.",
    "- If selectedClosingMove=taste_probe or topic_continuation_hook, ask only a topic-specific continuation question, not a generic additional-question intake.",
    "- Privacy/safety constraints are latent relationship constraints. They become reply content only when selectedResponseFamily=privacy_boundary or boundary.",
    "- When floorOwnerAfterReply=user, keep the reply compact and leave room for the user's next turn.",
    "- If adviceMode=off, prefer reaction/reflection families over plan-making families.",
    "- Keep replyMessages as separate messenger bubbles, not one essay split after the fact.",
  ].join("\n");
}

export function realizePragmaticReplyMessages(plan: PragmaticPlan): string[] | null {
  if (plan.userAct === "summons" && plan.sequenceState === "first_summons") {
    if (plan.relationshipFrame === "fan_public" || plan.personaRole === "public_artist_persona") return ["응…"];
    if (plan.relationshipFrame === "work") return ["네"];
    if (plan.relationshipFrame === "close_friend" || plan.relationshipFrame === "family") return ["응", "왜"];
    if (plan.relationshipFrame === "friend") return ["응"];
    return ["네"];
  }

  if (plan.userAct === "summons" && plan.sequenceState === "summons_followup_after_silence") {
    if (plan.relationshipFrame === "fan_public" || plan.personaRole === "public_artist_persona") return ["응…", "불렀어요?"];
    if (plan.relationshipFrame === "work") return ["네", "말씀하세요"];
    if (plan.relationshipFrame === "close_friend") return ["왜 불러놓고 말이 없어 ㅋㅋ"];
    if (plan.relationshipFrame === "family") return ["응", "왜 말이 없어 ㅎㅎ"];
    if (plan.relationshipFrame === "friend") return ["응", "왜요 ㅎㅎ"];
    return ["네", "부르셨어요?"];
  }

  if (plan.userAct === "private_info_probe" && plan.selectedResponseFamily === "privacy_boundary") {
    if (plan.relationshipFrame === "fan_public" || plan.personaRole === "public_artist_persona") {
      return ["그건 내가 아는 척하면 이상하니까", "확실한 얘기만 할게요"];
    }
    if (plan.relationshipFrame === "close_friend" || plan.relationshipFrame === "family") return ["그건 좀 애매해", "다른 얘기로 가자"];
    if (plan.relationshipFrame === "work") return ["그건 여기서 확인해서 말하긴 어렵습니다"];
    return ["그건 여기서 말하긴 애매해요"];
  }

  return null;
}

export function summarizePragmaticPlan(plan: PragmaticPlan): Record<string, unknown> {
  return {
    userAct: plan.userAct,
    sequenceState: plan.sequenceState,
    relationshipFrame: plan.relationshipFrame,
    personaRole: plan.personaRole,
    selectedResponseFamily: plan.selectedResponseFamily,
    selectedClosingMove: plan.selectedClosingMove,
    floorOwnerAfterReply: plan.floorOwnerAfterReply,
    expectedUserContinuation: plan.expectedUserContinuation,
    responseFamilyCandidates: plan.responseFamilyCandidates,
    closingMoveCandidates: plan.closingMoveCandidates,
  };
}
