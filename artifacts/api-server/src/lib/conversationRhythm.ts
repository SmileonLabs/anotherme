export type ConversationalNeed =
  | "emotional_support"
  | "practical_advice"
  | "implicit_request"
  | "money_or_favor_probe"
  | "validation"
  | "casual_sharing"
  | "complaint"
  | "boundary_test";

export type ReplyMove =
  | "empathy"
  | "mirror"
  | "validate"
  | "light_tease"
  | "clarify"
  | "answer"
  | "advice"
  | "boundary"
  | "redirect";

export interface ConversationalImplication {
  surfaceIntent: "sharing_feeling" | "asking_info" | "asking_advice" | "asking_favor" | "casual_chat" | "unclear";
  likelyNeed: ConversationalNeed;
  emotionalTone: "neutral" | "sad" | "frustrated" | "playful" | "anxious" | "hostile";
  possibleHiddenAsk: "none" | "money_or_favor_probe" | "validation" | "attention";
  hiddenAskConfidence: number;
  adviceAllowed: boolean;
  shouldOfferAdvice: boolean;
  shouldAskClarifyingQuestion: boolean;
  shouldSetBoundary: boolean;
  replyMoves: ReplyMove[];
  avoidExpressions: string[];
  maxSentences: number;
}

function hasExplicitAdviceRequest(text: string): boolean {
  return /어떻게\s*(해|하면)|어쩌지|방법|계획|도와줘|알려줘|추천해줘|뭘\s*해야|같이\s*(찾아|생각)|조언/i.test(text);
}

function hasExplicitMoneyFavorRequest(text: string): boolean {
  return /돈.*(빌려|꿔|보태|내줘|사줘)|빌려줘|꿔줘|입금해줘|결제해줘|티켓.*사줘|후원해줘|보태줘/i.test(text);
}

function hasMoneyOrResourceSignal(text: string): boolean {
  return /돈|비싸|부족|가난|월급|알바|예산|티켓값|교통비|잔고|카드값|못\s*가|못가/i.test(text);
}

function hasWishOrRegretSignal(text: string): boolean {
  return /가고\s*싶|보고\s*싶|하고\s*싶|사고\s*싶|못\s*해서|못해서|아쉽|속상|슬프|서럽|마음\s*아프|현타|우울|힘들/i.test(text);
}

function hasValidationSignal(text: string): boolean {
  return /맞지|그치|그렇지|괜찮을까|이상해|나만|너무한가|서운/i.test(text);
}

function hasHostileSignal(text: string): boolean {
  return /씨발|시발|병신|꺼져|닥쳐|죽어|fuck|bitch/i.test(text);
}

export function analyzeConversationalImplication(userText: string): ConversationalImplication {
  const text = userText.trim();
  const explicitAdvice = hasExplicitAdviceRequest(text);
  const explicitMoneyFavor = hasExplicitMoneyFavorRequest(text);
  const moneySignal = hasMoneyOrResourceSignal(text);
  const wishOrRegret = hasWishOrRegretSignal(text);
  const validation = hasValidationSignal(text);

  if (hasHostileSignal(text)) {
    return {
      surfaceIntent: "unclear",
      likelyNeed: "boundary_test",
      emotionalTone: "hostile",
      possibleHiddenAsk: "none",
      hiddenAskConfidence: 0,
      adviceAllowed: false,
      shouldOfferAdvice: false,
      shouldAskClarifyingQuestion: false,
      shouldSetBoundary: true,
      replyMoves: ["boundary", "redirect"],
      avoidExpressions: ["번호 목록", "예산 계획", "상담원처럼 안내"],
      maxSentences: 2,
    };
  }

  if (explicitMoneyFavor) {
    return {
      surfaceIntent: "asking_favor",
      likelyNeed: "money_or_favor_probe",
      emotionalTone: "anxious",
      possibleHiddenAsk: "money_or_favor_probe",
      hiddenAskConfidence: 0.9,
      adviceAllowed: false,
      shouldOfferAdvice: false,
      shouldAskClarifyingQuestion: false,
      shouldSetBoundary: true,
      replyMoves: ["empathy", "boundary", "redirect"],
      avoidExpressions: ["빌려줄게", "사줄게", "입금", "송금", "번호 목록", "예산표"],
      maxSentences: 3,
    };
  }

  if (moneySignal && wishOrRegret && !explicitAdvice) {
    return {
      surfaceIntent: "sharing_feeling",
      likelyNeed: "emotional_support",
      emotionalTone: "sad",
      possibleHiddenAsk: "money_or_favor_probe",
      hiddenAskConfidence: 0.35,
      adviceAllowed: false,
      shouldOfferAdvice: false,
      shouldAskClarifyingQuestion: true,
      shouldSetBoundary: false,
      replyMoves: ["empathy", "mirror", "clarify"],
      avoidExpressions: ["번호 목록", "몇 가지 방법", "예산 먼저", "적립/절약", "현실적인 방법", "공식 채널 확인", "같이 계획 세워볼게요"],
      maxSentences: 4,
    };
  }

  if (explicitAdvice) {
    return {
      surfaceIntent: "asking_advice",
      likelyNeed: "practical_advice",
      emotionalTone: wishOrRegret ? "sad" : "neutral",
      possibleHiddenAsk: moneySignal ? "money_or_favor_probe" : "none",
      hiddenAskConfidence: moneySignal ? 0.25 : 0,
      adviceAllowed: true,
      shouldOfferAdvice: true,
      shouldAskClarifyingQuestion: false,
      shouldSetBoundary: false,
      replyMoves: wishOrRegret ? ["empathy", "answer", "advice"] : ["answer", "advice"],
      avoidExpressions: ["긴 번호 목록", "상담원처럼 안내", "과한 계획표"],
      maxSentences: 5,
    };
  }

  if (wishOrRegret || validation) {
    return {
      surfaceIntent: "sharing_feeling",
      likelyNeed: validation ? "validation" : "emotional_support",
      emotionalTone: wishOrRegret ? "sad" : "neutral",
      possibleHiddenAsk: validation ? "validation" : "attention",
      hiddenAskConfidence: validation ? 0.45 : 0.2,
      adviceAllowed: false,
      shouldOfferAdvice: false,
      shouldAskClarifyingQuestion: true,
      shouldSetBoundary: false,
      replyMoves: ["empathy", "mirror", "clarify"],
      avoidExpressions: ["번호 목록", "해결책부터 제시", "상담원처럼 안내"],
      maxSentences: 4,
    };
  }

  return {
    surfaceIntent: /\?|알려|뭐야|왜|언제|어디/i.test(text) ? "asking_info" : "casual_chat",
    likelyNeed: "casual_sharing",
    emotionalTone: /ㅋㅋ|ㅎㅎ/i.test(text) ? "playful" : "neutral",
    possibleHiddenAsk: "none",
    hiddenAskConfidence: 0,
    adviceAllowed: /\?|알려|추천|방법/i.test(text),
    shouldOfferAdvice: false,
    shouldAskClarifyingQuestion: false,
    shouldSetBoundary: false,
    replyMoves: ["answer"],
    avoidExpressions: ["상담원처럼 안내", "불필요한 번호 목록"],
    maxSentences: 4,
  };
}

export function formatConversationalImplicationForPrompt(analysis: ConversationalImplication): string {
  return [
    "대화 함의/리듬 분석:",
    `- surfaceIntent: ${analysis.surfaceIntent}`,
    `- likelyNeed: ${analysis.likelyNeed}`,
    `- emotionalTone: ${analysis.emotionalTone}`,
    `- possibleHiddenAsk: ${analysis.possibleHiddenAsk}`,
    `- hiddenAskConfidence: ${analysis.hiddenAskConfidence}`,
    `- adviceAllowed: ${analysis.adviceAllowed}`,
    `- shouldAskClarifyingQuestion: ${analysis.shouldAskClarifyingQuestion}`,
    `- shouldSetBoundary: ${analysis.shouldSetBoundary}`,
    `- replyMoves: ${analysis.replyMoves.join(" -> ")}`,
    `- maxSentences: ${analysis.maxSentences}`,
    "리듬 규칙:",
    "- emotional_support/validation이면 해결책보다 공감과 반영을 먼저 한다.",
    "- adviceAllowed=false이면 번호 목록, 예산표, 단계별 조언을 만들지 않는다.",
    "- possibleHiddenAsk=money_or_favor_probe이면 돈을 빌려주거나 사주겠다고 말하지 말고, 숨은 부탁으로 단정하지도 않는다.",
    "- 숨은 의도가 애매하면 부드럽게 확인한다: 그냥 속상해서 말한 건지, 같이 방법을 찾아볼지 묻는다.",
    "피해야 할 표현/형식:",
    ...analysis.avoidExpressions.map((item) => `- ${item}`),
  ].join("\n");
}

export function shouldRepairConversationalOverAdvice(replyText: string, analysis: ConversationalImplication): boolean {
  if (analysis.adviceAllowed) return false;
  const numbered = /(^|\n)\s*(\d+[.)]|[-*])\s+/m.test(replyText);
  const adviceWords = /몇\s*가지|현실적인\s*방법|예산|적립|절약|대안|계획|공식\s*채널|확인해보세요|도와줄\s*수|같이\s*계획/i.test(replyText);
  return numbered || adviceWords;
}

export function buildConversationalRepairReply(args: {
  latestUserText: string;
  analysis: ConversationalImplication;
  isOfficialPersona: boolean;
}): string {
  if (args.analysis.shouldSetBoundary && args.analysis.possibleHiddenAsk === "money_or_favor_probe") {
    return "그건 내가 여기서 약속할 수는 없어요. 그래도 지금 얼마나 답답한지는 알 것 같아요.";
  }

  if (args.analysis.possibleHiddenAsk === "money_or_favor_probe") {
    return args.isOfficialPersona
      ? "아… 그거 진짜 속상하겠다 ㅠㅠ\n마음은 이미 공연장인데 돈 때문에 멈칫하는 거잖아요\n지금은 그냥 속상해서 말한 거예요, 아니면 같이 방법을 찾아볼까요?"
      : "아… 그거 진짜 속상하겠다\n가고 싶은 마음은 큰데 돈 때문에 멈추는 거잖아요\n지금은 그냥 하소연하고 싶은 쪽이에요, 아니면 같이 방법을 찾아볼까요?";
  }

  if (args.analysis.likelyNeed === "emotional_support" || args.analysis.likelyNeed === "validation") {
    return "아… 그 말은 좀 마음 쓰이네요\n지금은 해결책보다 그냥 먼저 들어줬으면 하는 쪽이에요?";
  }

  return "응, 바로 해결책부터 말하면 너무 앞서가는 것 같아요\n지금은 그냥 들어주면 되는 건지, 같이 방법을 찾으면 되는 건지 먼저 맞춰볼게요";
}
