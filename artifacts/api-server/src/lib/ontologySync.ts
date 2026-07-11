import { sql } from "drizzle-orm";
import type { Logger } from "pino";
import { db, ontologySyncJobsTable, type BattleEvaluation, type UserAiMemory } from "@workspace/db";
import { logger as defaultLogger } from "./logger";
import {
  recordBattlePersonaEvidence,
  recordDailyTalkRewardPersonaEvidence,
  recordPersonaAnalysisPersonaEvidence,
  recordUserAiMemoryPersonaEvidence,
} from "./personaOntology";

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 8;
const LOCK_TIMEOUT_SECONDS = 300;

interface DailyTalkRewardOntologyPayload extends Record<string, unknown> {
  kind: "daily_talk_reward";
  userId: string;
  rewardId: string;
  rewardDate: string;
  title: string;
  mood: string;
  keywords: string[];
  summary: string;
  scores: {
    empathy: number;
    communication: number;
    trust: number;
    positivity: number;
    contribution: number;
    spamRisk: number;
    qualityScore: number;
  };
  abuse?: {
    messageCount: number;
    userMessageCount: number;
    otherMessageCount: number;
    counterpartCount: number;
    repeatedMessageRatio: number;
    shortMessageRatio: number;
    selfMessageRatio: number;
    rewardMultiplier: number;
    reductions: string[];
  } | null;
  pvtAmount: number;
  consentVersion: string;
  sourceVersion: string;
}

interface BattleTurnOntologyPayload extends Record<string, unknown> {
  kind: "battle_turn";
  userId: string;
  roomId: string;
  matchSeq: number;
  turnIndex: number;
  round: number;
  topic: string;
  side: string;
  evaluation: BattleEvaluation;
  sourceVersion: string;
}

interface UserAiMemoryOntologyPayload extends Record<string, unknown> {
  kind: "user_ai_memory";
  userId: string;
  memoryId: string;
  sourceVersion: string;
}

interface PersonaAnalysisOntologyPayload extends Record<string, unknown> {
  kind: "persona_analysis";
  userId: string;
  analysisId: string;
  analyzedAt: string;
  summary: string | null;
  languageStyle: string | null;
  personalityTraits: string | null;
  valuesBeliefs: string | null;
  knowledgeDomains: string | null;
  emotionalPatterns: string | null;
  decisionStyle: string | null;
  confidence: number;
  dataCounts?: { chat?: number; battle?: number; dungeon?: number; growth?: number } | null;
  model?: string | null;
  sourceVersion: string;
}

interface PersonaAnalysisOntologySyncArgs {
  userId: string;
  analysisId: string;
  analyzedAt: string;
  summary: string | null;
  languageStyle: string | null;
  personalityTraits: string | null;
  valuesBeliefs: string | null;
  knowledgeDomains: string | null;
  emotionalPatterns: string | null;
  decisionStyle: string | null;
  confidence: number;
  dataCounts?: { chat?: number; battle?: number; dungeon?: number; growth?: number } | null;
  model?: string | null;
  log?: Logger;
}

interface ClaimedOntologySyncJob {
  id: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  sourceKey: string;
  payload: Record<string, unknown>;
  attempts: number;
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function rowsFromExecute(result: unknown): Array<Record<string, unknown>> {
  return (result as { rows?: Array<Record<string, unknown>> } | null)?.rows ?? [];
}

function backoffSeconds(attempts: number): number {
  return Math.min(3600, 15 * 2 ** Math.max(0, attempts - 1));
}

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 2000);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBattleEvaluation(value: unknown): value is BattleEvaluation {
  const evaluation = value as Record<string, unknown> | null;
  return !!evaluation
    && isNumber(evaluation.logic)
    && isNumber(evaluation.persuasiveness)
    && isNumber(evaluation.rebuttal)
    && isNumber(evaluation.wit)
    && isNumber(evaluation.manners)
    && isNumber(evaluation.total)
    && typeof evaluation.feedback === "string"
    && typeof evaluation.violation === "boolean";
}

function isDailyTalkRewardPayload(payload: Record<string, unknown>): payload is DailyTalkRewardOntologyPayload {
  const scores = payload.scores as Record<string, unknown> | undefined;
  return payload.kind === "daily_talk_reward"
    && typeof payload.userId === "string"
    && typeof payload.rewardId === "string"
    && typeof payload.rewardDate === "string"
    && typeof payload.title === "string"
    && typeof payload.mood === "string"
    && Array.isArray(payload.keywords)
    && typeof payload.summary === "string"
    && isNumber(payload.pvtAmount)
    && !!scores
    && isNumber(scores.empathy)
    && isNumber(scores.communication)
    && isNumber(scores.trust)
    && isNumber(scores.positivity)
    && isNumber(scores.contribution)
    && isNumber(scores.spamRisk)
    && isNumber(scores.qualityScore);
}

function isBattleTurnPayload(payload: Record<string, unknown>): payload is BattleTurnOntologyPayload {
  return payload.kind === "battle_turn"
    && typeof payload.userId === "string"
    && typeof payload.roomId === "string"
    && isNumber(payload.matchSeq)
    && isNumber(payload.turnIndex)
    && isNumber(payload.round)
    && typeof payload.topic === "string"
    && typeof payload.side === "string"
    && isBattleEvaluation(payload.evaluation);
}

function isUserAiMemoryPayload(payload: Record<string, unknown>): payload is UserAiMemoryOntologyPayload {
  return payload.kind === "user_ai_memory"
    && typeof payload.userId === "string"
    && typeof payload.memoryId === "string";
}

function isPersonaAnalysisPayload(payload: Record<string, unknown>): payload is PersonaAnalysisOntologyPayload {
  const isNullableString = (value: unknown) => value === null || typeof value === "string";
  const dataCounts = payload.dataCounts as Record<string, unknown> | null | undefined;
  const hasValidDataCounts = dataCounts === null || dataCounts === undefined || (
    (dataCounts.chat === undefined || isNumber(dataCounts.chat))
    && (dataCounts.battle === undefined || isNumber(dataCounts.battle))
    && (dataCounts.dungeon === undefined || isNumber(dataCounts.dungeon))
    && (dataCounts.growth === undefined || isNumber(dataCounts.growth))
  );
  return payload.kind === "persona_analysis"
    && typeof payload.userId === "string"
    && typeof payload.analysisId === "string"
    && typeof payload.analyzedAt === "string"
    && isNullableString(payload.summary)
    && isNullableString(payload.languageStyle)
    && isNullableString(payload.personalityTraits)
    && isNullableString(payload.valuesBeliefs)
    && isNullableString(payload.knowledgeDomains)
    && isNullableString(payload.emotionalPatterns)
    && isNullableString(payload.decisionStyle)
    && hasValidDataCounts
    && (payload.model === undefined || isNullableString(payload.model))
    && isNumber(payload.confidence);
}

export async function enqueueOntologySyncJob(params: {
  userId: string;
  sourceType: string;
  sourceId: string;
  sourceKey: string;
  payload: Record<string, unknown>;
  conflict?: "ignore" | "restart";
}): Promise<void> {
  const insert = db
    .insert(ontologySyncJobsTable)
    .values({
      userId: params.userId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      sourceKey: params.sourceKey,
      payload: params.payload,
      status: "pending",
    });
  if (params.conflict === "restart") {
    await insert.onConflictDoUpdate({
      target: ontologySyncJobsTable.sourceKey,
      set: {
        userId: params.userId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        payload: params.payload,
        status: "pending",
        attempts: 0,
        lastError: null,
        availableAt: new Date(),
        lockedAt: null,
        processedAt: null,
        updatedAt: new Date(),
      },
    });
    return;
  }
  await insert.onConflictDoNothing({ target: ontologySyncJobsTable.sourceKey });
}

export function dailyTalkRewardOntologySourceKey(rewardId: string): string {
  return `daily_talk_reward:${rewardId}:persona_ontology`;
}

export function battleTurnOntologySourceKey(args: { roomId: string; matchSeq: number; turnIndex: number; userId: string }): string {
  return `battle_turn:${args.roomId}:${args.matchSeq}:${args.turnIndex}:${args.userId}:persona_ontology`;
}

export function userAiMemoryOntologySourceKey(memoryId: string): string {
  return `user_ai_memory:${memoryId}:persona_ontology`;
}

export function personaAnalysisOntologySourceKey(args: { userId: string; analysisId: string }): string {
  return `persona_analysis:${args.userId}:${args.analysisId}:persona_ontology`;
}

export async function enqueueBattleTurnOntologySyncSafe(args: {
  userId: string;
  roomId: string;
  matchSeq: number;
  turnIndex: number;
  round: number;
  topic: string;
  side: string;
  evaluation: BattleEvaluation;
  log?: Logger;
}): Promise<void> {
  const log = args.log ?? defaultLogger;
  try {
    if (args.evaluation.violation || args.evaluation.total <= 0) return;
    const payload: BattleTurnOntologyPayload = {
      kind: "battle_turn",
      userId: args.userId,
      roomId: args.roomId,
      matchSeq: args.matchSeq,
      turnIndex: args.turnIndex,
      round: args.round,
      topic: args.topic,
      side: args.side,
      evaluation: args.evaluation,
      sourceVersion: "battle_turn_v1",
    };
    await enqueueOntologySyncJob({
      userId: args.userId,
      sourceType: "battle_turn",
      sourceId: args.roomId,
      sourceKey: battleTurnOntologySourceKey(args),
      payload: payload as unknown as Record<string, unknown>,
    });
  } catch (err) {
    log.warn({ err, roomId: args.roomId, userId: args.userId, turnIndex: args.turnIndex }, "Failed to enqueue battle ontology sync");
  }
}

export async function enqueueUserAiMemoryOntologySyncSafe(memory: Pick<UserAiMemory, "id" | "userId" | "status" | "privacyScope" | "subjectUserId">, log: Logger = defaultLogger): Promise<void> {
  try {
    if (memory.status !== "approved" || memory.subjectUserId || !["user_private", "public_profile"].includes(memory.privacyScope)) return;
    const payload: UserAiMemoryOntologyPayload = {
      kind: "user_ai_memory",
      userId: memory.userId,
      memoryId: memory.id,
      sourceVersion: "user_ai_memory_v1",
    };
    await enqueueOntologySyncJob({
      userId: memory.userId,
      sourceType: "user_ai_memory",
      sourceId: memory.id,
      sourceKey: userAiMemoryOntologySourceKey(memory.id),
      payload: payload as unknown as Record<string, unknown>,
      conflict: "restart",
    });
  } catch (err) {
    log.warn({ err, memoryId: memory.id, userId: memory.userId }, "Failed to enqueue user AI memory ontology sync");
  }
}

export async function enqueuePersonaAnalysisOntologySync(args: PersonaAnalysisOntologySyncArgs): Promise<void> {
  const payload: PersonaAnalysisOntologyPayload = {
    kind: "persona_analysis",
    userId: args.userId,
    analysisId: args.analysisId,
    analyzedAt: args.analyzedAt,
    summary: args.summary,
    languageStyle: args.languageStyle,
    personalityTraits: args.personalityTraits,
    valuesBeliefs: args.valuesBeliefs,
    knowledgeDomains: args.knowledgeDomains,
    emotionalPatterns: args.emotionalPatterns,
    decisionStyle: args.decisionStyle,
    confidence: args.confidence,
    dataCounts: args.dataCounts ?? null,
    model: args.model ?? null,
    sourceVersion: "persona_analysis_v1",
  };
  await enqueueOntologySyncJob({
    userId: args.userId,
    sourceType: "persona_analysis",
    sourceId: args.analysisId,
    sourceKey: personaAnalysisOntologySourceKey(args),
    payload: payload as unknown as Record<string, unknown>,
    conflict: "restart",
  });
}

export async function enqueuePersonaAnalysisOntologySyncSafe(args: PersonaAnalysisOntologySyncArgs): Promise<void> {
  const log = args.log ?? defaultLogger;
  try {
    await enqueuePersonaAnalysisOntologySync(args);
  } catch (err) {
    log.warn({ err, userId: args.userId, analysisId: args.analysisId }, "Failed to enqueue persona analysis ontology sync");
  }
}

async function claimJobs(limit: number, maxAttempts: number): Promise<ClaimedOntologySyncJob[]> {
  const result = await db.execute(sql`
    UPDATE ontology_sync_jobs
    SET status = 'processing',
        locked_at = now(),
        attempts = attempts + 1,
        updated_at = now()
    WHERE id IN (
      SELECT id
      FROM ontology_sync_jobs
      WHERE status IN ('pending', 'failed')
        AND attempts < ${maxAttempts}
        AND available_at <= now()
        AND (locked_at IS NULL OR locked_at < now() - (${LOCK_TIMEOUT_SECONDS} * interval '1 second'))
      ORDER BY available_at ASC, created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      id,
      user_id AS "userId",
      source_type AS "sourceType",
      source_id AS "sourceId",
      source_key AS "sourceKey",
      payload,
      attempts
  `);

  return rowsFromExecute(result).map((row) => ({
    id: String(row.id),
    userId: String(row.userId),
    sourceType: String(row.sourceType),
    sourceId: String(row.sourceId),
    sourceKey: String(row.sourceKey),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    attempts: Number(row.attempts ?? 0),
  }));
}

async function markProcessed(jobId: string): Promise<void> {
  await db.execute(sql`
    UPDATE ontology_sync_jobs
    SET status = 'processed',
        locked_at = NULL,
        processed_at = now(),
        updated_at = now(),
        last_error = NULL
    WHERE id = ${jobId}
  `);
}

async function markFailed(job: ClaimedOntologySyncJob, err: unknown, maxAttempts: number): Promise<void> {
  const finalFailure = job.attempts >= maxAttempts;
  const availableAt = new Date(Date.now() + backoffSeconds(job.attempts) * 1000);
  await db.execute(sql`
    UPDATE ontology_sync_jobs
    SET status = ${finalFailure ? "failed" : "pending"},
        locked_at = NULL,
        available_at = ${availableAt},
        last_error = ${errorText(err)},
        updated_at = now()
    WHERE id = ${job.id}
  `);
}

async function processJob(job: ClaimedOntologySyncJob, log: Logger): Promise<void> {
  if (job.sourceType === "daily_talk_reward") {
    if (!isDailyTalkRewardPayload(job.payload)) {
      throw new Error("invalid daily_talk_reward ontology payload");
    }
    await recordDailyTalkRewardPersonaEvidence({
      userId: job.payload.userId,
      rewardId: job.payload.rewardId,
      rewardDate: job.payload.rewardDate,
      title: job.payload.title,
      mood: job.payload.mood,
      keywords: job.payload.keywords.filter((item): item is string => typeof item === "string"),
      summary: job.payload.summary,
      scores: job.payload.scores,
      abuse: job.payload.abuse ?? null,
      pvtAmount: job.payload.pvtAmount,
      throwOnFailure: true,
      log,
    });
    return;
  }

  if (job.sourceType === "battle_turn") {
    if (!isBattleTurnPayload(job.payload)) {
      throw new Error("invalid battle_turn ontology payload");
    }
    await recordBattlePersonaEvidence({
      userId: job.payload.userId,
      roomId: job.payload.roomId,
      matchSeq: job.payload.matchSeq,
      turnIndex: job.payload.turnIndex,
      round: job.payload.round,
      topic: job.payload.topic,
      side: job.payload.side,
      evaluation: job.payload.evaluation,
      throwOnFailure: true,
      log,
    });
    return;
  }

  if (job.sourceType === "user_ai_memory") {
    if (!isUserAiMemoryPayload(job.payload)) {
      throw new Error("invalid user_ai_memory ontology payload");
    }
    await recordUserAiMemoryPersonaEvidence({
      userId: job.payload.userId,
      memoryId: job.payload.memoryId,
      throwOnFailure: true,
      log,
    });
    return;
  }

  if (job.sourceType === "persona_analysis") {
    if (!isPersonaAnalysisPayload(job.payload)) {
      throw new Error("invalid persona_analysis ontology payload");
    }
    await recordPersonaAnalysisPersonaEvidence({
      userId: job.payload.userId,
      analysisId: job.payload.analysisId,
      analyzedAt: job.payload.analyzedAt,
      summary: job.payload.summary,
      languageStyle: job.payload.languageStyle,
      personalityTraits: job.payload.personalityTraits,
      valuesBeliefs: job.payload.valuesBeliefs,
      knowledgeDomains: job.payload.knowledgeDomains,
      emotionalPatterns: job.payload.emotionalPatterns,
      decisionStyle: job.payload.decisionStyle,
      confidence: job.payload.confidence,
      dataCounts: job.payload.dataCounts ?? null,
      model: job.payload.model ?? null,
      throwOnFailure: true,
      log,
    });
    return;
  }

  throw new Error(`unsupported ontology sync source type: ${job.sourceType}`);
}

export async function processOntologySyncBatch(log: Logger = defaultLogger): Promise<number> {
  const batchSize = envNumber("ONTOLOGY_SYNC_BATCH_SIZE", DEFAULT_BATCH_SIZE);
  const maxAttempts = envNumber("ONTOLOGY_SYNC_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS);
  const jobs = await claimJobs(batchSize, maxAttempts);
  for (const job of jobs) {
    try {
      await processJob(job, log);
      await markProcessed(job.id);
    } catch (err) {
      log.warn({ err, jobId: job.id, sourceType: job.sourceType, sourceId: job.sourceId }, "Ontology sync job failed");
      await markFailed(job, err, maxAttempts);
    }
  }
  return jobs.length;
}

let started = false;
let running = false;

export function startOntologySyncWorker(log: Logger = defaultLogger): void {
  if (started || process.env.ONTOLOGY_SYNC_WORKER_ENABLED === "false") return;
  started = true;
  const intervalMs = envNumber("ONTOLOGY_SYNC_INTERVAL_MS", DEFAULT_INTERVAL_MS);
  const tick = () => {
    if (running) return;
    running = true;
    void processOntologySyncBatch(log)
      .catch((err) => log.warn({ err }, "Ontology sync worker tick failed"))
      .finally(() => {
        running = false;
      });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
}

export type { BattleTurnOntologyPayload, DailyTalkRewardOntologyPayload, PersonaAnalysisOntologyPayload, UserAiMemoryOntologyPayload };
