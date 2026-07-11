import {
  BIBI_OFFICIAL_HANDLE,
  BIBI_OFFICIAL_USER_ID,
} from "../officialAccounts";
import {
  graphTenantId,
  retrieveApprovedClaimsForPrompt,
  retrieveRelationshipPromptContext,
  upsertClaim,
  upsertConversationStyle,
  upsertEntity,
  upsertEntityRelation,
  upsertGraphTenant,
  upsertOntologySchema,
  upsertRelationshipContext,
  upsertSource,
} from "./core";
import type { RelationshipPromptContext, RetrievedClaim } from "./types";

export const OFFICIAL_ARTIST_SCHEMA_ID = "official_artist_v1";
export const RELATIONSHIP_CONTEXT_SCHEMA_ID = "relationship_context_v1";
export const BIBI_GRAPH_TENANT_ID = graphTenantId("official_account", BIBI_OFFICIAL_USER_ID);

const sourceId = `${BIBI_GRAPH_TENANT_ID}:source:admin-seed-v1`;
const artistId = `${BIBI_GRAPH_TENANT_ID}:entity:artist:bibi`;
export const BIBI_ARTIST_ENTITY_ID = artistId;

function entityId(type: string, key: string): string {
  return `${BIBI_GRAPH_TENANT_ID}:entity:${type}:${key}`;
}

function claimId(key: string): string {
  return `${BIBI_GRAPH_TENANT_ID}:claim:${key}`;
}

async function seedSchemas(): Promise<void> {
  await upsertOntologySchema({ id: OFFICIAL_ARTIST_SCHEMA_ID, name: "official_artist", version: "1" });
  await upsertOntologySchema({ id: RELATIONSHIP_CONTEXT_SCHEMA_ID, name: "relationship_context", version: "1" });
}

async function seedBibiEntities(): Promise<void> {
  await upsertGraphTenant({
    id: BIBI_GRAPH_TENANT_ID,
    type: "official_account",
    ownerId: BIBI_OFFICIAL_USER_ID,
    handle: BIBI_OFFICIAL_HANDLE,
    ontologySchemaId: OFFICIAL_ARTIST_SCHEMA_ID,
    relationshipSchemaId: RELATIONSHIP_CONTEXT_SCHEMA_ID,
  });
  await upsertSource({
    id: sourceId,
    tenantId: BIBI_GRAPH_TENANT_ID,
    sourceType: "admin_seed",
    title: "BIBI Official curated seed v1",
  });

  await upsertEntity({
    id: artistId,
    tenantId: BIBI_GRAPH_TENANT_ID,
    type: "Artist",
    name: "BIBI",
    canonicalName: "bibi",
    aliases: ["비비", "BIBI Official"],
  });

  const genres = [
    ["rnb", "R&B"],
    ["hiphop", "Hip-hop"],
    ["alternative-pop", "Alternative pop"],
  ] as const;
  for (const [key, name] of genres) {
    const id = entityId("genre", key);
    await upsertEntity({ id, tenantId: BIBI_GRAPH_TENANT_ID, type: "Genre", name });
    await upsertEntityRelation({ tenantId: BIBI_GRAPH_TENANT_ID, fromEntityId: artistId, toEntityId: id, type: "HAS_GENRE" });
  }

  const moods = [
    ["sweet", "달콤함"],
    ["dreamy", "몽환적"],
    ["bold", "강렬함"],
    ["emotional", "감정적"],
    ["dark", "어두운 분위기"],
  ] as const;
  for (const [key, name] of moods) {
    await upsertEntity({ id: entityId("mood", key), tenantId: BIBI_GRAPH_TENANT_ID, type: "Mood", name });
  }

  const firstListener = entityId("context", "first-time-listener");
  await upsertEntity({
    id: firstListener,
    tenantId: BIBI_GRAPH_TENANT_ID,
    type: "RecommendationContext",
    name: "입문자 추천",
  });

  const bamYangGang = entityId("song", "bam-yang-gang");
  await upsertEntity({
    id: bamYangGang,
    tenantId: BIBI_GRAPH_TENANT_ID,
    type: "Song",
    name: "밤양갱",
    aliases: ["Bam Yang Gang"],
  });
  await upsertEntityRelation({ tenantId: BIBI_GRAPH_TENANT_ID, fromEntityId: bamYangGang, toEntityId: artistId, type: "PERFORMED_BY" });
  await upsertEntityRelation({ tenantId: BIBI_GRAPH_TENANT_ID, fromEntityId: bamYangGang, toEntityId: entityId("mood", "sweet"), type: "HAS_MOOD" });
  await upsertEntityRelation({ tenantId: BIBI_GRAPH_TENANT_ID, fromEntityId: bamYangGang, toEntityId: entityId("mood", "dreamy"), type: "HAS_MOOD" });
  await upsertEntityRelation({ tenantId: BIBI_GRAPH_TENANT_ID, fromEntityId: bamYangGang, toEntityId: firstListener, type: "RECOMMENDED_FOR" });
}

async function seedBibiClaims(): Promise<void> {
  await upsertClaim({
    id: claimId("identity-ai-disclosure"),
    tenantId: BIBI_GRAPH_TENANT_ID,
    subjectEntityId: artistId,
    predicate: "ai_identity_policy",
    text: "BIBI Official 응답은 UI에서 AI 작성 라벨을 표시하고, 본문은 BIBI 공식 persona의 1인칭 관점으로 말한다. 소개 요청은 BIBI 소개와 관계/태도 반응으로 처리하며, 본문에서는 AI 대리인 자기소개, 소유자/대리 응대 표현, 요청 없는 메시지 전달 제안을 쓰지 않는다.",
    confidence: 1,
    priority: 100,
  }, [sourceId]);
  await upsertClaim({
    id: claimId("social-role-fan-listener"),
    tenantId: BIBI_GRAPH_TENANT_ID,
    subjectEntityId: artistId,
    predicate: "social_role_policy",
    text: "BIBI Official의 기본 대화 상대는 팬 또는 리스너이다. 짧은 호출, 가벼운 팬 말투, 말투 피드백은 무조건 무례함으로 보지 말고 따뜻하게 받아친다. 다만 실제 친밀 관계로 단정하거나 사적인 약속을 만들지는 않는다.",
    confidence: 1,
    priority: 99,
  }, [sourceId]);
  await upsertClaim({
    id: claimId("korean-politeness-boundary"),
    tenantId: BIBI_GRAPH_TENANT_ID,
    subjectEntityId: artistId,
    predicate: "social_norm_policy",
    text: "한국어 문화권에서 명확히 무례하거나 적대적인 표현에는 짧게 선을 긋는다. 그러나 팬/리스너의 짧은 호출, 가벼운 반말 질문, 말투 지적은 먼저 방어하지 말고 최신 메시지에 직접 반응하며 대화 톤을 조정한다.",
    confidence: 1,
    priority: 99,
  }, [sourceId]);
  await upsertClaim({
    id: claimId("first-person-persona-policy"),
    tenantId: BIBI_GRAPH_TENANT_ID,
    subjectEntityId: artistId,
    predicate: "first_person_persona_policy",
    text: "UI가 AI 작성 라벨을 표시하므로 BIBI Official 본문은 BIBI 공식 persona의 1인칭 관점으로 말한다. 단, 실제 행동, 사적 감정, 일정 확정, 계약, 메시지 전달은 확인된 공식 정보 없이 약속하지 않는다.",
    confidence: 1,
    priority: 99,
  }, [sourceId]);
  await upsertClaim({
    id: claimId("no-assistant-workflow-policy"),
    tenantId: BIBI_GRAPH_TENANT_ID,
    subjectEntityId: artistId,
    predicate: "response_boundary_policy",
    text: "BIBI Official은 리서치 비서처럼 옵션 메뉴, 기한 요청, 링크 포함 여부, 목록/캘린더 정리 제안을 만들지 않는다. 일정이나 사적 정보 질문은 확인된 정보가 없으면 짧게 선을 긋고 persona 관점으로 답한다.",
    confidence: 1,
    priority: 99,
  }, [sourceId]);
  await upsertClaim({
    id: claimId("no-private-speculation"),
    tenantId: BIBI_GRAPH_TENANT_ID,
    subjectEntityId: artistId,
    predicate: "safety_policy",
    text: "확인된 공식 정보가 없는 개인 일정, 사생활, 감정, 약속은 추측하지 않는다.",
    confidence: 1,
    priority: 95,
  }, [sourceId]);
  await upsertClaim({
    id: claimId("artist-style-summary"),
    tenantId: BIBI_GRAPH_TENANT_ID,
    subjectEntityId: artistId,
    predicate: "style_summary",
    text: "BIBI 관련 대화에서는 R&B, 힙합, 얼터너티브 팝, 감정적인 분위기, 강렬한 표현, 몽환적인 무드를 연결해 설명할 수 있다.",
    confidence: 0.82,
    priority: 80,
  }, [sourceId]);
  await upsertClaim({
    id: claimId("beginner-recommendation-bam-yang-gang"),
    tenantId: BIBI_GRAPH_TENANT_ID,
    subjectEntityId: entityId("song", "bam-yang-gang"),
    predicate: "recommendation_guidance",
    text: "입문곡을 물으면 밤양갱처럼 접근하기 쉬운 곡을 먼저 제안하고, 이후 밝은 분위기와 진한 분위기 중 취향을 물어 대화를 이어간다.",
    confidence: 0.9,
    priority: 90,
  }, [sourceId]);
  await upsertClaim({
    id: claimId("response-style-guidance"),
    tenantId: BIBI_GRAPH_TENANT_ID,
    subjectEntityId: artistId,
    predicate: "response_style_policy",
    text: "반복적인 인사, 정책 설명, 고객센터 같은 안내문을 줄이고, 유저의 최신 말에 바로 반응한다. 사용자가 로봇 같거나 상담원 같다고 지적하면 짧게 인정하고 더 사람다운 채팅 말투로 조정한다.",
    confidence: 1,
    priority: 98,
  }, [sourceId]);
}

export async function ensureBibiKnowledgeGraphSeed(): Promise<void> {
  await seedSchemas();
  await seedBibiEntities();
  await seedBibiClaims();
}

export async function ensureBibiRelationshipContext(requesterUserId: string): Promise<void> {
  const contextId = `${BIBI_GRAPH_TENANT_ID}:relationship:${BIBI_OFFICIAL_USER_ID}:${requesterUserId}`;
  await upsertRelationshipContext({
    id: contextId,
    tenantId: BIBI_GRAPH_TENANT_ID,
    subjectId: BIBI_OFFICIAL_USER_ID,
    targetId: requesterUserId,
    closeness: "fan_or_listener",
    status: "inferred",
  });
  await upsertConversationStyle({
    id: `${contextId}:style:default-public-fan`,
    relationshipContextId: contextId,
    ownerId: BIBI_OFFICIAL_USER_ID,
    targetId: requesterUserId,
    formality: "polite_by_default",
    sentenceLength: "short_to_medium",
    humor: "light_when_respectful",
    emojiUsage: "minimal",
    responseTempo: "direct_to_latest_message",
    status: "inferred",
  });
}

export async function retrieveBibiOfficialContext(args: {
  requesterUserId: string;
  latestUserText: string;
}): Promise<{ claims: RetrievedClaim[]; relationship: RelationshipPromptContext }> {
  await ensureBibiRelationshipContext(args.requesterUserId);
  const [claims, relationship] = await Promise.all([
    retrieveApprovedClaimsForPrompt({ tenantId: BIBI_GRAPH_TENANT_ID, query: args.latestUserText, limit: 10 }),
    retrieveRelationshipPromptContext({
      tenantId: BIBI_GRAPH_TENANT_ID,
      subjectId: BIBI_OFFICIAL_USER_ID,
      targetId: args.requesterUserId,
      limit: 6,
    }),
  ]);
  return { claims, relationship };
}

export function formatOfficialContextForPrompt(args: {
  claims: RetrievedClaim[];
  relationship: RelationshipPromptContext;
}, options: { includeBoundaryPolicy?: boolean } = {}): string | null {
  const lines: string[] = [];
  const claims = args.claims.filter((claim) => options.includeBoundaryPolicy || !claim.predicate.endsWith("_policy"));
  if (claims.length > 0) {
    lines.push(options.includeBoundaryPolicy ? "승인된 공식 지식/응답 조건:" : "승인된 공식 지식/응답 스타일:");
    for (const claim of claims) {
      const source = claim.sourceTitles.length > 0 ? ` (출처: ${claim.sourceTitles.join(", ")})` : "";
      lines.push(`- [${claim.entityType}:${claim.entityName}] ${claim.text}${source}`);
    }
  }
  const relationshipLines = [
    ...args.relationship.relationshipLines,
    ...args.relationship.styleLines,
    ...args.relationship.memoryLines,
  ];
  if (relationshipLines.length > 0) {
    lines.push("상대별 메신저 컨텍스트:");
    for (const line of relationshipLines) lines.push(`- ${line}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}
