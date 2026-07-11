import type { ManagedTransaction } from "neo4j-driver";
import { runKnowledgeGraphRead, runKnowledgeGraphWrite } from "./client";
import type {
  ClaimInput,
  ConversationStyleInput,
  EntityInput,
  EntityRelationInput,
  GraphTenantInput,
  OntologySchemaInput,
  PersonaEvidenceInput,
  PersonaPromptContext,
  PersonaSignalInput,
  PersonaSignalKind,
  RelationshipContextInput,
  RelationshipPromptContext,
  RetrievedClaim,
  SourceInput,
  UserPersonaInput,
} from "./types";

const DEFAULT_LIMIT = 12;
const PERSONA_SIGNAL_RELATION: Record<PersonaSignalKind, string> = {
  Trait: "HAS_TRAIT",
  CommunicationStyle: "HAS_STYLE",
  Preference: "HAS_PREFERENCE",
  Habit: "HAS_HABIT",
  Capability: "HAS_CAPABILITY",
  ConflictStyle: "HAS_CONFLICT_STYLE",
  RelationshipStyle: "HAS_RELATIONSHIP_STYLE",
};

function nowIso(): string {
  return new Date().toISOString();
}

function canonical(value: string): string {
  return value.trim().toLowerCase();
}

function termsFromText(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[\p{P}\p{S}]+/gu, " ")
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2)
        .slice(0, 12),
    ),
  );
}

async function write(statement: string, params: Record<string, unknown>): Promise<boolean> {
  const result = await runKnowledgeGraphWrite(async (tx) => {
    await tx.run(statement, params);
    return true;
  });
  return result === true;
}

export function graphTenantId(type: string, ownerId: string): string {
  return `${type}:${ownerId}`;
}

export async function upsertOntologySchema(input: OntologySchemaInput): Promise<void> {
  await write(
    `
    MERGE (schema:OntologySchema {id: $id})
    ON CREATE SET schema.createdAt = $now
    SET schema.name = $name,
        schema.version = $version,
        schema.updatedAt = $now
    `,
    { ...input, now: nowIso() },
  );
}

export async function upsertGraphTenant(input: GraphTenantInput): Promise<void> {
  await write(
    `
    MERGE (tenant:GraphTenant {id: $id})
    ON CREATE SET tenant.createdAt = $now
    SET tenant.type = $type,
        tenant.ownerId = $ownerId,
        tenant.handle = $handle,
        tenant.status = $status,
        tenant.updatedAt = $now
    WITH tenant
    OPTIONAL MATCH (ontology:OntologySchema {id: $ontologySchemaId})
    FOREACH (_ IN CASE WHEN ontology IS NULL THEN [] ELSE [1] END |
      MERGE (tenant)-[:USES_SCHEMA {kind: 'ontology'}]->(ontology)
    )
    WITH tenant
    OPTIONAL MATCH (relationship:OntologySchema {id: $relationshipSchemaId})
    FOREACH (_ IN CASE WHEN relationship IS NULL THEN [] ELSE [1] END |
      MERGE (tenant)-[:USES_SCHEMA {kind: 'relationship'}]->(relationship)
    )
    `,
    {
      ...input,
      handle: input.handle ?? null,
      status: input.status ?? "approved",
      ontologySchemaId: input.ontologySchemaId ?? null,
      relationshipSchemaId: input.relationshipSchemaId ?? null,
      now: nowIso(),
    },
  );
}

export async function upsertUserPersona(input: UserPersonaInput): Promise<void> {
  await write(
    `
    MATCH (tenant:GraphTenant {id: $tenantId})
    MERGE (persona:UserPersona {id: $id})
    ON CREATE SET persona.createdAt = $now
    SET persona.tenantId = $tenantId,
        persona.userId = $userId,
        persona.status = $status,
        persona.updatedAt = $now
    MERGE (tenant)-[:OWNS]->(persona)
    `,
    { ...input, status: input.status ?? "inferred", now: nowIso() },
  );
}

export async function upsertPersonaEvidence(input: PersonaEvidenceInput): Promise<boolean> {
  return write(
    `
    MATCH (tenant:GraphTenant {id: $tenantId})
    MERGE (evidence:PersonaEvidence {id: $id})
    ON CREATE SET evidence.createdAt = $now
    SET evidence.tenantId = $tenantId,
        evidence.userId = $userId,
        evidence.sourceType = $sourceType,
        evidence.sourceId = $sourceId,
        evidence.title = $title,
        evidence.summary = $summary,
        evidence.status = $status,
        evidence.visibility = $visibility,
        evidence.updatedAt = $now
    MERGE (tenant)-[:OWNS]->(evidence)
    `,
    {
      ...input,
      sourceId: input.sourceId ?? null,
      status: input.status ?? "inferred",
      visibility: input.visibility ?? "user_private",
      now: nowIso(),
    },
  );
}

export async function upsertPersonaSignal(input: PersonaSignalInput): Promise<boolean> {
  const relation = PERSONA_SIGNAL_RELATION[input.kind];
  if (!relation) return false;
  return write(
    `
    MATCH (persona:UserPersona {id: $personaId, userId: $userId})
    MERGE (signal:PersonaSignal:${input.kind} {id: $signalId})
    ON CREATE SET signal.createdAt = $now
    SET signal.tenantId = $tenantId,
        signal.kind = $kind,
        signal.key = $key,
        signal.label = $label,
        signal.status = $status,
        signal.updatedAt = $now
    MERGE (persona)-[rel:${relation}]->(signal)
    SET rel.weight = CASE WHEN rel.weight IS NULL OR rel.weight < $weight THEN $weight ELSE rel.weight END,
        rel.confidence = CASE WHEN rel.confidence IS NULL OR rel.confidence < $confidence THEN $confidence ELSE rel.confidence END,
        rel.status = $status,
        rel.updatedAt = $now
    WITH persona, signal
    OPTIONAL MATCH (evidence:PersonaEvidence {id: $evidenceId})
    FOREACH (_ IN CASE WHEN evidence IS NULL THEN [] ELSE [1] END |
      MERGE (persona)-[:SUPPORTED_BY]->(evidence)
      MERGE (evidence)-[support:SUPPORTS]->(signal)
      SET support.score = $weight,
          support.confidence = $confidence,
          support.updatedAt = $now
    )
    `,
    {
      tenantId: input.tenantId,
      userId: input.userId,
      personaId: input.personaId,
      signalId: `${input.tenantId}:user:${input.userId}:${input.kind}:${input.key}`,
      kind: input.kind,
      key: input.key,
      label: input.label,
      weight: input.weight ?? 0.5,
      confidence: input.confidence ?? 0.6,
      status: input.status ?? "inferred",
      evidenceId: input.evidenceId ?? null,
      now: nowIso(),
    },
  );
}

export async function upsertEntity(input: EntityInput): Promise<void> {
  await write(
    `
    MATCH (tenant:GraphTenant {id: $tenantId})
    MERGE (entity:Entity {id: $id})
    ON CREATE SET entity.createdAt = $now
    SET entity.tenantId = $tenantId,
        entity.type = $type,
        entity.name = $name,
        entity.canonicalName = $canonicalName,
        entity.aliases = $aliases,
        entity.status = $status,
        entity.updatedAt = $now
    MERGE (tenant)-[:OWNS]->(entity)
    `,
    {
      ...input,
      canonicalName: input.canonicalName ? canonical(input.canonicalName) : canonical(input.name),
      aliases: input.aliases ?? [],
      status: input.status ?? "approved",
      now: nowIso(),
    },
  );
}

export async function upsertSource(input: SourceInput): Promise<void> {
  await write(
    `
    MATCH (tenant:GraphTenant {id: $tenantId})
    MERGE (source:Source {id: $id})
    ON CREATE SET source.createdAt = $now,
                  source.collectedAt = $now
    SET source.tenantId = $tenantId,
        source.sourceType = $sourceType,
        source.title = $title,
        source.url = $url,
        source.updatedAt = $now
    MERGE (tenant)-[:OWNS]->(source)
    `,
    { ...input, url: input.url ?? null, now: nowIso() },
  );
}

export async function upsertClaim(input: ClaimInput, sourceIds: string[] = []): Promise<void> {
  await write(
    `
    MATCH (subject:Entity {id: $subjectEntityId})
    MERGE (claim:Claim {id: $id})
    ON CREATE SET claim.createdAt = $now
    SET claim.tenantId = $tenantId,
        claim.text = $text,
        claim.predicate = $predicate,
        claim.value = $value,
        claim.confidence = $confidence,
        claim.status = $status,
        claim.visibility = $visibility,
        claim.priority = $priority,
        claim.updatedAt = $now
    MERGE (subject)-[:HAS_CLAIM]->(claim)
    WITH claim
    UNWIND $sourceIds AS sourceId
    MATCH (source:Source {id: sourceId})
    MERGE (claim)-[:SUPPORTED_BY]->(source)
    `,
    {
      ...input,
      value: input.value ?? null,
      confidence: input.confidence ?? 0.8,
      status: input.status ?? "approved",
      visibility: input.visibility ?? "official_public",
      priority: input.priority ?? 0,
      sourceIds,
      now: nowIso(),
    },
  );
}

export async function upsertEntityRelation(input: EntityRelationInput): Promise<void> {
  const relationType = input.type.replace(/[^A-Z0-9_]/g, "_").toUpperCase();
  await write(
    `
    MATCH (from:Entity {id: $fromEntityId})
    MATCH (to:Entity {id: $toEntityId})
    MERGE (from)-[rel:${relationType}]->(to)
    ON CREATE SET rel.createdAt = $now
    SET rel.tenantId = $tenantId,
        rel.confidence = $confidence,
        rel.status = $status,
        rel.visibility = $visibility,
        rel.updatedAt = $now
    `,
    {
      ...input,
      confidence: input.confidence ?? 0.8,
      status: input.status ?? "approved",
      visibility: input.visibility ?? "official_public",
      now: nowIso(),
    },
  );
}

export async function upsertRelationshipContext(input: RelationshipContextInput): Promise<void> {
  await write(
    `
    MATCH (tenant:GraphTenant {id: $tenantId})
    MERGE (context:RelationshipContext {id: $id})
    ON CREATE SET context.createdAt = $now
    SET context.tenantId = $tenantId,
        context.subjectId = $subjectId,
        context.targetId = $targetId,
        context.closeness = $closeness,
        context.status = $status,
        context.updatedAt = $now
    MERGE (tenant)-[:OWNS]->(context)
    `,
    {
      ...input,
      closeness: input.closeness ?? null,
      status: input.status ?? "inferred",
      now: nowIso(),
    },
  );
}

export async function upsertConversationStyle(input: ConversationStyleInput): Promise<void> {
  await write(
    `
    MATCH (context:RelationshipContext {id: $relationshipContextId})
    MERGE (style:ConversationStyle {id: $id})
    ON CREATE SET style.createdAt = $now
    SET style.ownerId = $ownerId,
        style.targetId = $targetId,
        style.formality = $formality,
        style.sentenceLength = $sentenceLength,
        style.humor = $humor,
        style.emojiUsage = $emojiUsage,
        style.responseTempo = $responseTempo,
        style.status = $status,
        style.updatedAt = $now
    MERGE (context)-[:HAS_STYLE]->(style)
    `,
    {
      ...input,
      formality: input.formality ?? null,
      sentenceLength: input.sentenceLength ?? null,
      humor: input.humor ?? null,
      emojiUsage: input.emojiUsage ?? null,
      responseTempo: input.responseTempo ?? null,
      status: input.status ?? "inferred",
      now: nowIso(),
    },
  );
}

async function searchApprovedClaims(tx: ManagedTransaction, tenantId: string, terms: string[], limit: number) {
  return tx.run(
    `
    MATCH (:GraphTenant {id: $tenantId})-[:OWNS]->(entity:Entity)-[:HAS_CLAIM]->(claim:Claim)
    WHERE claim.status = 'approved'
      AND claim.visibility IN ['official_public', 'public_profile']
      AND (
        $hasTerms = false OR
        ANY(term IN $terms WHERE
          toLower(entity.name) CONTAINS term OR
          entity.canonicalName CONTAINS term OR
          toLower(claim.text) CONTAINS term OR
          toLower(coalesce(claim.value, '')) CONTAINS term
        )
      )
    OPTIONAL MATCH (claim)-[:SUPPORTED_BY]->(source:Source)
    RETURN entity.type AS entityType,
           entity.name AS entityName,
           claim.predicate AS predicate,
           claim.text AS text,
           claim.value AS value,
           claim.confidence AS confidence,
           claim.priority AS priority,
           collect(source.title)[0..3] AS sourceTitles
    ORDER BY claim.priority DESC, claim.confidence DESC
    LIMIT $limit
    `,
    { tenantId, terms, hasTerms: terms.length > 0, limit },
  );
}

export async function retrieveApprovedClaimsForPrompt(args: {
  tenantId: string;
  query: string;
  limit?: number;
}): Promise<RetrievedClaim[]> {
  const terms = termsFromText(args.query);
  const limit = args.limit ?? DEFAULT_LIMIT;
  const result = await runKnowledgeGraphRead(async (tx) => {
    const direct = await searchApprovedClaims(tx, args.tenantId, terms, limit);
    if (direct.records.length > 0) return direct;
    return searchApprovedClaims(tx, args.tenantId, [], limit);
  });
  if (!result) return [];
  return result.records.map((record) => ({
    entityType: String(record.get("entityType") ?? "Entity"),
    entityName: String(record.get("entityName") ?? ""),
    predicate: String(record.get("predicate") ?? "related"),
    text: String(record.get("text") ?? ""),
    value: record.get("value") == null ? null : String(record.get("value")),
    confidence: Number(record.get("confidence") ?? 0),
    sourceTitles: (record.get("sourceTitles") as unknown[] | null ?? [])
      .filter((title): title is string => typeof title === "string" && title.length > 0),
  })).filter((claim) => claim.text.length > 0);
}

export async function retrieveRelationshipPromptContext(args: {
  tenantId: string;
  subjectId: string;
  targetId: string;
  limit?: number;
}): Promise<RelationshipPromptContext> {
  const result = await runKnowledgeGraphRead(async (tx) => tx.run(
    `
    MATCH (:GraphTenant {id: $tenantId})-[:OWNS]->(context:RelationshipContext {subjectId: $subjectId, targetId: $targetId})
    OPTIONAL MATCH (context)-[:HAS_STYLE]->(style:ConversationStyle)
    WHERE style.status IN ['approved', 'inferred']
    OPTIONAL MATCH (context)-[:HAS_SHARED_MEMORY]->(memory:SharedMemory)
    WHERE memory.status IN ['approved', 'inferred']
      AND memory.privacyScope IN ['relationship_private', 'public_profile']
    OPTIONAL MATCH (context)-[:HAS_HABIT]->(habit:InteractionHabit)
    WHERE habit.status IN ['approved', 'inferred']
    RETURN context.closeness AS closeness,
           collect(DISTINCT style) AS styles,
           collect(DISTINCT memory.text) AS memories,
           collect(DISTINCT habit.pattern) AS habits
    LIMIT 1
    `,
    {
      tenantId: args.tenantId,
      subjectId: args.subjectId,
      targetId: args.targetId,
    },
  ));

  const empty: RelationshipPromptContext = { relationshipLines: [], styleLines: [], memoryLines: [] };
  if (!result || result.records.length === 0) return empty;
  const record = result.records[0];
  const relationshipLines = record.get("closeness") ? [`관계 친밀도: ${String(record.get("closeness"))}`] : [];
  const limit = args.limit ?? 8;
  const styleLines = (record.get("styles") as Array<{ properties?: Record<string, unknown> }> | null ?? [])
    .slice(0, 3)
    .map((style) => style.properties ?? {})
    .flatMap((style) => [
      style.formality ? `상대별 격식: ${String(style.formality)}` : null,
      style.sentenceLength ? `상대별 문장 길이: ${String(style.sentenceLength)}` : null,
      style.humor ? `상대별 유머 강도: ${String(style.humor)}` : null,
      style.emojiUsage ? `상대별 이모지 사용: ${String(style.emojiUsage)}` : null,
      style.responseTempo ? `상대별 답장 템포: ${String(style.responseTempo)}` : null,
    ])
    .filter((line): line is string => !!line);
  const memories = (record.get("memories") as unknown[] | null ?? [])
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .slice(0, limit)
    .map((line) => `공유 기억: ${line}`);
  const habits = (record.get("habits") as unknown[] | null ?? [])
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .slice(0, limit)
    .map((line) => `대화 버릇: ${line}`);
  return { relationshipLines, styleLines, memoryLines: [...memories, ...habits] };
}

function signalLine(prefix: string, item: { label: string; confidence: number }): string {
  const confidence = Math.round(item.confidence * 100);
  return `${prefix}: ${item.label}${confidence > 0 ? ` (신뢰도 ${confidence}%)` : ""}`;
}

export async function retrieveUserPersonaPromptContext(args: {
  tenantId: string;
  userId: string;
  limit?: number;
}): Promise<PersonaPromptContext> {
  const limit = args.limit ?? 12;
  const result = await runKnowledgeGraphRead(async (tx) => tx.run(
    `
    MATCH (:GraphTenant {id: $tenantId})-[:OWNS]->(persona:UserPersona {userId: $userId})
    OPTIONAL MATCH (persona)-[rel]->(signal:PersonaSignal)
    WHERE type(rel) IN ['HAS_TRAIT', 'HAS_STYLE', 'HAS_PREFERENCE', 'HAS_HABIT', 'HAS_CAPABILITY', 'HAS_CONFLICT_STYLE', 'HAS_RELATIONSHIP_STYLE']
      AND coalesce(rel.status, signal.status, 'inferred') IN ['approved', 'inferred']
    WITH persona, signal, rel
    ORDER BY coalesce(rel.weight, 0) DESC, coalesce(rel.confidence, 0) DESC
    WITH persona, collect({kind: signal.kind, label: signal.label, confidence: coalesce(rel.confidence, 0.6)})[0..$limit] AS signals
    OPTIONAL MATCH (persona)-[:SUPPORTED_BY]->(evidence:PersonaEvidence)
    WHERE evidence.status IN ['approved', 'inferred']
      AND evidence.visibility IN ['user_private', 'relationship_private', 'public_profile']
    RETURN signals, collect(DISTINCT evidence.summary)[0..5] AS evidenceSummaries
    `,
    { tenantId: args.tenantId, userId: args.userId, limit },
  ));

  const empty: PersonaPromptContext = {
    traitLines: [],
    styleLines: [],
    preferenceLines: [],
    capabilityLines: [],
    conflictStyleLines: [],
    evidenceLines: [],
  };
  if (!result || result.records.length === 0) return empty;
  const record = result.records[0];
  const signals = (record.get("signals") as Array<{ kind?: string; label?: string; confidence?: number }> | null ?? [])
    .filter((item) => typeof item.label === "string" && item.label.length > 0)
    .map((item) => ({ kind: String(item.kind ?? ""), label: String(item.label), confidence: Number(item.confidence ?? 0.6) }));
  const byKind = (kind: PersonaSignalKind) => signals.filter((item) => item.kind === kind);
  const evidenceLines = (record.get("evidenceSummaries") as unknown[] | null ?? [])
    .filter((line): line is string => typeof line === "string" && line.length > 0)
    .map((line) => `근거: ${line}`);
  return {
    traitLines: byKind("Trait").map((item) => signalLine("대표 성향", item)),
    styleLines: [
      ...byKind("CommunicationStyle").map((item) => signalLine("말투/표현", item)),
      ...byKind("Habit").map((item) => signalLine("대화 습관", item)),
      ...byKind("RelationshipStyle").map((item) => signalLine("관계별 스타일", item)),
    ],
    preferenceLines: byKind("Preference").map((item) => signalLine("선호", item)),
    capabilityLines: byKind("Capability").map((item) => signalLine("표현 역량", item)),
    conflictStyleLines: byKind("ConflictStyle").map((item) => signalLine("갈등/반박 스타일", item)),
    evidenceLines,
  };
}
