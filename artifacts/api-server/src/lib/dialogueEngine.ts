import {
  analyzeConversationalImplication,
  buildConversationalRepairReply,
  formatConversationalImplicationForPrompt,
  shouldRepairConversationalOverAdvice,
} from "./conversationRhythm";

export type RelationshipPhase = "first_contact" | "warming_up" | "familiar" | "tense" | "work";
export type AllowedCasualness = "none" | "partial" | "full";
export type UserStyle = "unknown" | "polite" | "playful" | "blunt" | "rude";
export type PersonaRegister = "casual" | "soft_polite" | "formal" | "official_polite";
export type EmojiStyle = "none" | "minimal" | "light_kk" | "light_ㅋㅋ_ㅠㅠ";
export type PunctuationStyle = "standard" | "natural" | "no_period";
export type SentenceLength = "short" | "medium" | "mixed";
export type PersonaWarmth = "dry" | "neutral" | "warm" | "playful";

export type DialogueIntent =
  | "call_only"
  | "playful_chat"
  | "intro_request"
  | "recommendation_request"
  | "fact_question"
  | "private_or_schedule_request"
  | "rude_or_hostile";

export type DialogueEmotion = "neutral" | "playful" | "warm" | "annoyed" | "hostile";
export type RespectSignal = "polite" | "casual_fan_call" | "blunt" | "rude" | "hostile";

export type DialogueAct =
  | "warm_acknowledge"
  | "playful_tease"
  | "answer_directly"
  | "ask_back_lightly"
  | "continue_topic"
  | "soft_boundary"
  | "firm_boundary"
  | "deflect_private"
  | "recommend"
  | "repair_misunderstanding";

export interface DialogueState {
  roomId: string;
  personaUserId: string;
  targetUserId: string;
  relationshipPhase: RelationshipPhase;
  allowedCasualness: AllowedCasualness;
  userStyle: UserStyle;
  currentTopic: string | null;
  lastDialogueAct: DialogueAct | null;
  lastBoundaryAt: string | null;
  recentAiOpeners: string[];
  repeatedFailureCount: number;
  snapshotJson?: Record<string, unknown>;
  updatedAt: string;
}

export interface DialogueTurn {
  id: string;
  roomId: string;
  personaUserId: string;
  targetUserId: string;
  userMessageId: string | null;
  userText: string;
  intent: DialogueIntent;
  emotion: DialogueEmotion;
  respectSignal: RespectSignal;
  dialogueAct: DialogueAct;
  factLookupNeeded: boolean;
  replyMessagesJson: string[];
  humanLikenessScore: number;
  repetitionScore: number;
  createdAt: string;
}

export interface PersonaDictionary {
  personaId: string;
  ownerUserId: string;
  displayName: string;
  isOfficialPersona: boolean;

  // How to say. Ontology/facts decide what can be said; this decides the surface voice.
  ageTone?: string;
  register: PersonaRegister;
  emojiStyle: EmojiStyle;
  punctuation: PunctuationStyle;
  sentenceLength: SentenceLength;
  warmth: PersonaWarmth;
  avoidExpressions: string[];
  examples?: Array<{ user: string; reply: string }>;
}

export interface ClassificationResult {
  intent: DialogueIntent;
  emotion: DialogueEmotion;
  respectSignal: RespectSignal;
  topic: string | null;
  factLookupNeeded: boolean;
  boundaryNeeded: boolean;
}

export interface KnowledgeContext {
  facts: Array<{
    text: string;
    sourceTitle?: string | null;
    sourceUrl?: string | null;
  }>;
  policyConstraints: string[];
}

export interface SystemPrompt {
  system: string;
  user: string;
  metadata: {
    dialogueAct: DialogueAct;
    factLookupNeeded: boolean;
    avoidExpressions: string[];
  };
}

export interface AnotherMeReplyJob {
  id: string;
  roomId: string;
  personaUserId: string;
  targetUserId: string;
  latestMessageId: string;
  userInput: string;
}

export interface QueuedAnotherMeReplyJob extends AnotherMeReplyJob {
  status: "queued" | "processing" | "completed" | "failed";
  attempts: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface InsertedMessage {
  id: string;
  content: string;
}

export interface DialogueEngineDeps {
  loadDialogueState(job: AnotherMeReplyJob): Promise<DialogueState>;
  selectPersona(job: AnotherMeReplyJob, state: DialogueState): Promise<PersonaDictionary>;
  fetchKnowledgeContext(job: AnotherMeReplyJob, classification: ClassificationResult): Promise<KnowledgeContext>;
  generateDraft(prompt: SystemPrompt): Promise<string>;
  insertAnotherMeMessage(args: {
    roomId: string;
    senderId: string;
    content: string;
    authorKind: "another_me";
    metadata: Record<string, unknown>;
  }): Promise<InsertedMessage>;
  publishRealtime(args: {
    type: "typing_started" | "typing_stopped" | "message_created";
    roomId: string;
    actorUserId: string;
    data?: Record<string, unknown>;
  }): Promise<void>;
  sendPush(message: InsertedMessage): Promise<void>;
  updateDialogueState(args: {
    state: DialogueState;
    classification: ClassificationResult;
    dialogueAct: DialogueAct;
    sentMessages: string[];
    evaluator: HumanLikenessResult;
  }): Promise<void>;
  logDialogueTurn(args: {
    job: AnotherMeReplyJob;
    classification: ClassificationResult;
    dialogueAct: DialogueAct;
    sentMessages: string[];
    evaluator: HumanLikenessResult;
  }): Promise<void>;
}

export interface HumanLikenessResult {
  passed: boolean;
  score: number;
  reasons: string[];
  shouldRegenerate: boolean;
}

const POLICY_LANGUAGE_PATTERNS = [
  /공개된\s*정보\s*(안에서|범위에서)?/gi,
  /자연스럽게\s*얘기해볼게요/gi,
  /확인된\s*범위에서\s*말할게요/gi,
  /AI\s*작성\s*라벨/gi,
  /대리인|대신\s*응대|주인에게\s*전달/gi,
];

const ASSISTANT_TONE_PATTERNS = [
  /무엇을\s*도와드릴까요/i,
  /도와\s*드릴게요/i,
  /안내해\s*드릴게요/i,
  /정리해\s*드릴게요/i,
  /원하시면/i,
  /옵션/i,
  /링크\s*포함/i,
  /캘린더형|목록형/i,
];

function hasPoliteEnding(text: string): boolean {
  return /(요|세요|습니다|습니까|해주세요|부탁드려요)([.!?~\s]|$)/.test(text);
}

function hasHostileSignal(text: string): boolean {
  return /씨발|시발|병신|미친|꺼져|닥쳐|죽어|좆|개새|지랄|fuck|bitch/i.test(text);
}

function hasRudeSignal(text: string): boolean {
  return hasHostileSignal(text) || /뭐냐|누구냐|재수없|짜증나|개같|한심|멍청|바보/i.test(text);
}

function firstSentence(text: string): string {
  return text.split(/\n+|(?<=[.!?。！？])\s+/)[0]?.trim() ?? "";
}

function normalizeForSimilarity(value: string): string {
  return value.toLowerCase().replace(/[\s.!?~ㅋㅋㅎㅎㅠㅜ]+/g, "").trim();
}

function isSimilarOpening(candidate: string, previous: string): boolean {
  const a = normalizeForSimilarity(candidate);
  const b = normalizeForSimilarity(previous);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export class DialogueClassifier {
  async classify(userInput: string, _state: DialogueState): Promise<ClassificationResult> {
    const text = userInput.trim();
    const polite = hasPoliteEnding(text);

    if (hasHostileSignal(text) || hasRudeSignal(text)) {
      return {
        intent: "rude_or_hostile",
        emotion: hasHostileSignal(text) ? "hostile" : "annoyed",
        respectSignal: hasHostileSignal(text) ? "hostile" : "rude",
        topic: null,
        factLookupNeeded: false,
        boundaryNeeded: true,
      };
    }

    if (/일정|스케줄|공연|콘서트|방송|출연|어디|집|연애|사생활|연락처|dm|디엠/i.test(text)) {
      return {
        intent: "private_or_schedule_request",
        emotion: "neutral",
        respectSignal: polite ? "polite" : "casual_fan_call",
        topic: "private_or_schedule",
        factLookupNeeded: false,
        boundaryNeeded: true,
      };
    }

    if (/추천|입문|노래|곡|앨범|플리|playlist/i.test(text)) {
      return {
        intent: "recommendation_request",
        emotion: "neutral",
        respectSignal: polite ? "polite" : "casual_fan_call",
        topic: "recommendation",
        factLookupNeeded: true,
        boundaryNeeded: false,
      };
    }

    if (/누구|소개|프로필|뭐\s*하는|어떤\s*(사람|아티스트)|who|about/i.test(text)) {
      return {
        intent: "intro_request",
        emotion: "neutral",
        respectSignal: polite ? "polite" : "casual_fan_call",
        topic: "intro",
        factLookupNeeded: true,
        boundaryNeeded: false,
      };
    }

    if (/^[\p{L}\p{N}\s]{1,14}[야아]?[~!?.]*$/u.test(text)) {
      return {
        intent: "call_only",
        emotion: "playful",
        respectSignal: polite ? "polite" : "casual_fan_call",
        topic: null,
        factLookupNeeded: false,
        boundaryNeeded: false,
      };
    }

    return {
      intent: /ㅋㅋ|ㅎㅎ|ㅠㅠ|보고싶|좋아/i.test(text) ? "playful_chat" : "fact_question",
      emotion: /ㅋㅋ|ㅎㅎ/i.test(text) ? "playful" : "neutral",
      respectSignal: polite ? "polite" : "casual_fan_call",
      topic: null,
      factLookupNeeded: /언제|왜|어떻게|뭐야|알려|설명|정보/i.test(text),
      boundaryNeeded: false,
    };
  }
}

export class DialogueActPlanner {
  plan(classification: ClassificationResult, state: DialogueState): DialogueAct {
    const boundaryRecentlyUsed = state.lastBoundaryAt
      ? Date.now() - new Date(state.lastBoundaryAt).getTime() < 5 * 60 * 1000
      : false;

    if (classification.intent === "rude_or_hostile") return boundaryRecentlyUsed ? "answer_directly" : "firm_boundary";
    if (classification.intent === "private_or_schedule_request") return "deflect_private";
    if (classification.intent === "recommendation_request") return "recommend";
    if (classification.intent === "call_only") return state.userStyle === "playful" || state.relationshipPhase !== "first_contact" ? "playful_tease" : "warm_acknowledge";
    if (classification.intent === "playful_chat") return "ask_back_lightly";
    if (classification.boundaryNeeded && !boundaryRecentlyUsed) return "soft_boundary";
    return "answer_directly";
  }
}

export class KnowledgeContextGating {
  constructor(
    private readonly fetchFacts: (classification: ClassificationResult) => Promise<KnowledgeContext>,
  ) {}

  async fetchContext(classification: ClassificationResult): Promise<KnowledgeContext | null> {
    // Hot path gate: casual chat and call-only turns must not hit Neo4j/Graph DB.
    if (!classification.factLookupNeeded) return null;
    return this.fetchFacts(classification);
  }
}

export class DynamicPromptBuilder {
  build(persona: PersonaDictionary, state: DialogueState, act: DialogueAct, context: KnowledgeContext | null, userInput = ""): SystemPrompt {
    const facts = context?.facts ?? [];
    const conversationalImplication = analyzeConversationalImplication(userInput);
    const avoidExpressions = Array.from(new Set([
      ...persona.avoidExpressions,
      ...state.recentAiOpeners,
      ...conversationalImplication.avoidExpressions,
      "공개된 정보 안에서",
      "자연스럽게 얘기해볼게요",
      "무엇을 도와드릴까요",
      "도와드릴게요",
      "안내해드릴게요",
    ])).filter(Boolean);

    return {
      system: [
        "You generate one concise messenger-style persona reply.",
        "The UI already marks this as AI-authored. Do not explain AI identity in the reply body.",
        "Policy and safety constraints are internal. Do not expose policy wording unless the user directly asks about policy.",
        "Do not use assistant/customer-service phrasing. React to the latest message like a chat participant.",
        "Do not claim real-world presence, private feelings, schedules, contracts, payments, legal agreement, or message delivery.",
        "Reply in Korean unless the user clearly uses another language.",
        "",
        `Persona: ${persona.displayName}`,
        `Persona register: ${persona.register}`,
        `Age/tone hint: ${persona.ageTone ?? "not specified"}`,
        `Emoji style: ${persona.emojiStyle}`,
        `Punctuation: ${persona.punctuation}`,
        `Sentence length: ${persona.sentenceLength}`,
        `Warmth: ${persona.warmth}`,
        `Official persona: ${persona.isOfficialPersona}`,
        "",
        `Relationship phase: ${state.relationshipPhase}`,
        `Allowed casualness: ${state.allowedCasualness}`,
        `User style: ${state.userStyle}`,
        `Current topic: ${state.currentTopic ?? "none"}`,
        `Dialogue act for this turn: ${act}`,
        formatConversationalImplicationForPrompt(conversationalImplication),
        "",
        "Avoid these exact expressions/openers:",
        ...avoidExpressions.map((item) => `- ${item}`),
        "",
        facts.length > 0 ? "Approved fact context:" : "Approved fact context: none for this turn.",
        ...facts.map((fact) => `- ${fact.text}${fact.sourceTitle ? ` (source: ${fact.sourceTitle})` : ""}`),
        "",
        persona.examples?.length ? "Voice examples:" : "Voice examples: none.",
        ...(persona.examples ?? []).slice(0, 4).flatMap((example) => [`User: ${example.user}`, `Reply: ${example.reply}`]),
        "",
        "Return only the final reply text.",
      ].join("\n"),
      user: userInput,
      metadata: {
        dialogueAct: act,
        factLookupNeeded: !!context && facts.length > 0,
        avoidExpressions,
      },
    };
  }
}

export class MessengerPostProcessor {
  splitIntoMessengerMessages(text: string): string[] {
    const cleaned = text.replace(/\r\n/g, "\n").replace(/\s+\n/g, "\n").trim();
    if (!cleaned) return [];

    const parts = cleaned
      .split(/\n+/)
      .flatMap((part) => part.split(/(?<=[.!?。！？])\s+|(?<=요)\s+(?=[가-힣A-Za-z])/))
      .map((part) => part.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    for (const part of parts) {
      if (part.length <= 90) {
        chunks.push(part);
        continue;
      }
      for (let index = 0; index < part.length; index += 80) {
        const chunk = part.slice(index, index + 80).trim();
        if (chunk) chunks.push(chunk);
      }
    }

    return chunks.slice(0, 4);
  }

  casualizeByPersona(text: string, persona: PersonaDictionary, allowedCasualness: AllowedCasualness): string {
    const casualAllowed = allowedCasualness === "full" && persona.register === "casual" && !persona.isOfficialPersona;
    let output = text;

    if (casualAllowed) {
      output = output
        .replace(/했습니다/g, "했어")
        .replace(/했어요/g, "했어")
        .replace(/합니다/g, "해")
        .replace(/해요/g, "해")
        .replace(/입니다/g, "이야")
        .replace(/이에요/g, "이야")
        .replace(/예요/g, "야");
    } else {
      // First-contact, official, and work contexts keep soft messenger polite style.
      output = output
        .replace(/했습니다/g, "했어요")
        .replace(/합니다/g, "해요")
        .replace(/됩니다/g, "돼요")
        .replace(/입니다/g, "이에요");
    }

    if (persona.punctuation === "no_period") output = output.replace(/\.+$/g, "");
    return output.trim();
  }

  removePolicyLanguage(text: string): string {
    let output = text;
    for (const pattern of POLICY_LANGUAGE_PATTERNS) output = output.replace(pattern, "");
    return output.replace(/\s{2,}/g, " ").replace(/\s+([.!?])/g, "$1").trim();
  }

  render(text: string, persona: PersonaDictionary, state: DialogueState): string[] {
    return this.splitIntoMessengerMessages(this.removePolicyLanguage(text))
      .map((part) => this.casualizeByPersona(part, persona, state.allowedCasualness))
      .map((part) => this.removePolicyLanguage(part))
      .filter((part) => part.length > 0);
  }
}

export class HumanLikenessEvaluator {
  async evaluate(messages: string[], state: DialogueState): Promise<HumanLikenessResult> {
    const reasons: string[] = [];
    let score = 100;
    const joined = messages.join("\n");
    const opening = firstSentence(messages[0] ?? "");

    if (messages.length === 0) {
      return { passed: false, score: 0, reasons: ["empty_reply"], shouldRegenerate: true };
    }
    if (messages.some((message) => message.length > 120)) {
      score -= 15;
      reasons.push("long_message_chunk");
    }
    if (ASSISTANT_TONE_PATTERNS.some((pattern) => pattern.test(joined))) {
      score -= 30;
      reasons.push("assistant_tone");
    }
    if (POLICY_LANGUAGE_PATTERNS.some((pattern) => pattern.test(joined))) {
      score -= 25;
      reasons.push("policy_language_exposed");
    }
    if (state.recentAiOpeners.some((previous) => isSimilarOpening(opening, previous))) {
      score -= 25;
      reasons.push("repeated_opener");
    }
    if (state.lastDialogueAct && ["soft_boundary", "firm_boundary"].includes(state.lastDialogueAct) && /처음부터|툭\s*부르면|말은\s*조금/i.test(joined)) {
      score -= 20;
      reasons.push("repeated_boundary");
    }

    const finalScore = Math.max(0, score);
    return {
      passed: finalScore >= 70,
      score: finalScore,
      reasons,
      shouldRegenerate: finalScore < 70,
    };
  }
}

export function calculateTypingDelay(text: string): number {
  return Math.round(text.length * 30 + Math.random() * (400 - 100) + 100);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HumanLikeMessageSender {
  constructor(private readonly deps: Pick<DialogueEngineDeps, "insertAnotherMeMessage" | "publishRealtime" | "sendPush">) {}

  async sendSequentially(job: AnotherMeReplyJob, messages: string[], metadata: Record<string, unknown>): Promise<void> {
    await this.deps.publishRealtime({
      type: "typing_started",
      roomId: job.roomId,
      actorUserId: job.personaUserId,
      data: { personaUserId: job.personaUserId, targetUserId: job.targetUserId },
    });

    try {
      for (const content of messages) {
        await sleep(calculateTypingDelay(content));
        const message = await this.deps.insertAnotherMeMessage({
          roomId: job.roomId,
          senderId: job.personaUserId,
          content,
          authorKind: "another_me",
          metadata,
        });
        await this.deps.publishRealtime({
          type: "message_created",
          roomId: job.roomId,
          actorUserId: job.personaUserId,
          data: { messageId: message.id },
        });
        await this.deps.sendPush(message);
      }
    } finally {
      await this.deps.publishRealtime({
        type: "typing_stopped",
        roomId: job.roomId,
        actorUserId: job.personaUserId,
        data: { personaUserId: job.personaUserId, targetUserId: job.targetUserId },
      });
    }
  }
}

export class StatefulPersonaDialogueEngine {
  private readonly classifier = new DialogueClassifier();
  private readonly planner = new DialogueActPlanner();
  private readonly promptBuilder = new DynamicPromptBuilder();
  private readonly postProcessor = new MessengerPostProcessor();
  private readonly evaluator = new HumanLikenessEvaluator();
  private readonly sender: HumanLikeMessageSender;

  constructor(private readonly deps: DialogueEngineDeps) {
    this.sender = new HumanLikeMessageSender(deps);
  }

  async processReplyJob(job: AnotherMeReplyJob): Promise<void> {
    const state = await this.deps.loadDialogueState(job);
    const persona = await this.deps.selectPersona(job, state);
    const classification = await this.classifier.classify(job.userInput, state);
    const dialogueAct = this.planner.plan(classification, state);
    const knowledgeGate = new KnowledgeContextGating((result) => this.deps.fetchKnowledgeContext(job, result));
    const context = await knowledgeGate.fetchContext(classification);
    const prompt = this.promptBuilder.build(persona, state, dialogueAct, context, job.userInput);
    const draft = await this.deps.generateDraft(prompt);
    const conversationalImplication = analyzeConversationalImplication(job.userInput);
    let rendered = this.postProcessor.render(draft, persona, state);
    if (shouldRepairConversationalOverAdvice(rendered.join("\n"), conversationalImplication)) {
      rendered = this.postProcessor.render(
        buildConversationalRepairReply({
          latestUserText: job.userInput,
          analysis: conversationalImplication,
          isOfficialPersona: persona.isOfficialPersona,
        }),
        persona,
        state,
      );
    }
    let evaluator = await this.evaluator.evaluate(rendered, state);

    if (!evaluator.passed && evaluator.shouldRegenerate) {
      const repairPrompt = {
        ...prompt,
        system: [
          prompt.system,
          "",
          "Regenerate once. Avoid the failed issues below and keep the reply shorter and more chat-like.",
          ...evaluator.reasons.map((reason) => `- ${reason}`),
        ].join("\n"),
      };
      rendered = this.postProcessor.render(await this.deps.generateDraft(repairPrompt), persona, state);
      if (shouldRepairConversationalOverAdvice(rendered.join("\n"), conversationalImplication)) {
        rendered = this.postProcessor.render(
          buildConversationalRepairReply({
            latestUserText: job.userInput,
            analysis: conversationalImplication,
            isOfficialPersona: persona.isOfficialPersona,
          }),
          persona,
          state,
        );
      }
      evaluator = await this.evaluator.evaluate(rendered, state);
    }

    await this.sender.sendSequentially(job, rendered, {
      anotherMe: true,
      ownerUserId: job.personaUserId,
      dialogueEngine: "stateful_persona_v1",
      dialogueAct,
      classification,
      humanLikenessScore: evaluator.score,
      humanLikenessReasons: evaluator.reasons,
    });

    await this.deps.updateDialogueState({ state, classification, dialogueAct, sentMessages: rendered, evaluator });
    await this.deps.logDialogueTurn({ job, classification, dialogueAct, sentMessages: rendered, evaluator });
  }
}
