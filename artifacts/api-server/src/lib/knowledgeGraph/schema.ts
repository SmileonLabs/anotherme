import { getKnowledgeGraphDriver, verifyKnowledgeGraphConnection } from "./client";
import { logger as defaultLogger } from "../logger";

const SCHEMA_STATEMENTS = [
  "CREATE CONSTRAINT kg_graph_tenant_id IF NOT EXISTS FOR (n:GraphTenant) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT kg_ontology_schema_id IF NOT EXISTS FOR (n:OntologySchema) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT kg_entity_id IF NOT EXISTS FOR (n:Entity) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT kg_claim_id IF NOT EXISTS FOR (n:Claim) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT kg_source_id IF NOT EXISTS FOR (n:Source) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT kg_persona_id IF NOT EXISTS FOR (n:Persona) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT kg_user_persona_id IF NOT EXISTS FOR (n:UserPersona) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT kg_persona_signal_id IF NOT EXISTS FOR (n:PersonaSignal) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT kg_persona_evidence_id IF NOT EXISTS FOR (n:PersonaEvidence) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT kg_memory_id IF NOT EXISTS FOR (n:Memory) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT kg_campaign_id IF NOT EXISTS FOR (n:Campaign) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT kg_relationship_context_id IF NOT EXISTS FOR (n:RelationshipContext) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT kg_conversation_style_id IF NOT EXISTS FOR (n:ConversationStyle) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT kg_interaction_habit_id IF NOT EXISTS FOR (n:InteractionHabit) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT kg_shared_memory_id IF NOT EXISTS FOR (n:SharedMemory) REQUIRE n.id IS UNIQUE",
  "CREATE INDEX kg_entity_tenant_type IF NOT EXISTS FOR (n:Entity) ON (n.tenantId, n.type)",
  "CREATE INDEX kg_entity_canonical IF NOT EXISTS FOR (n:Entity) ON (n.canonicalName)",
  "CREATE INDEX kg_claim_tenant_status IF NOT EXISTS FOR (n:Claim) ON (n.tenantId, n.status)",
  "CREATE INDEX kg_memory_scope IF NOT EXISTS FOR (n:Memory) ON (n.tenantId, n.privacyScope, n.status)",
  "CREATE INDEX kg_user_persona_user IF NOT EXISTS FOR (n:UserPersona) ON (n.userId, n.status)",
  "CREATE INDEX kg_persona_signal_kind_key IF NOT EXISTS FOR (n:PersonaSignal) ON (n.kind, n.key)",
  "CREATE INDEX kg_persona_evidence_user IF NOT EXISTS FOR (n:PersonaEvidence) ON (n.userId, n.sourceType, n.status)",
  "CREATE INDEX kg_relationship_pair IF NOT EXISTS FOR (n:RelationshipContext) ON (n.subjectId, n.targetId)",
];

export async function ensureKnowledgeGraphSchema(): Promise<void> {
  const driver = getKnowledgeGraphDriver();
  if (!driver) return;
  const connected = await verifyKnowledgeGraphConnection();
  if (!connected) return;

  const session = driver.session();
  try {
    for (const statement of SCHEMA_STATEMENTS) {
      await session.run(statement);
    }
  } catch (err) {
    defaultLogger.warn({ err }, "Failed to ensure knowledge graph schema");
  } finally {
    await session.close();
  }
}
