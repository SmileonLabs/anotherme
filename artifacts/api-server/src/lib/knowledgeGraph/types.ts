export type GraphTenantType = "official_account" | "user_private" | "relationship" | "community" | "system";
export type KnowledgeStatus = "draft" | "approved" | "rejected" | "archived" | "inferred";
export type PrivacyScope = "official_public" | "public_profile" | "user_private" | "relationship_private" | "system_internal";
export type PersonaSignalKind = "Trait" | "CommunicationStyle" | "Preference" | "Habit" | "Capability" | "ConflictStyle" | "RelationshipStyle";

export interface GraphTenantInput {
  id: string;
  type: GraphTenantType;
  ownerId: string;
  handle?: string | null;
  status?: KnowledgeStatus;
  ontologySchemaId?: string | null;
  relationshipSchemaId?: string | null;
}

export interface OntologySchemaInput {
  id: string;
  name: string;
  version: string;
}

export interface EntityInput {
  id: string;
  tenantId: string;
  type: string;
  name: string;
  canonicalName?: string;
  aliases?: string[];
  status?: KnowledgeStatus;
}

export interface ClaimInput {
  id: string;
  tenantId: string;
  subjectEntityId: string;
  text: string;
  predicate: string;
  value?: string | null;
  confidence?: number;
  status?: KnowledgeStatus;
  visibility?: PrivacyScope;
  priority?: number;
}

export interface SourceInput {
  id: string;
  tenantId: string;
  sourceType: string;
  title: string;
  url?: string | null;
}

export interface EntityRelationInput {
  tenantId: string;
  fromEntityId: string;
  toEntityId: string;
  type: string;
  confidence?: number;
  status?: KnowledgeStatus;
  visibility?: PrivacyScope;
}

export interface RelationshipContextInput {
  id: string;
  tenantId: string;
  subjectId: string;
  targetId: string;
  closeness?: string | null;
  status?: KnowledgeStatus;
}

export interface ConversationStyleInput {
  id: string;
  relationshipContextId: string;
  ownerId: string;
  targetId: string;
  formality?: string | null;
  sentenceLength?: string | null;
  humor?: string | null;
  emojiUsage?: string | null;
  responseTempo?: string | null;
  status?: KnowledgeStatus;
}

export interface RetrievedClaim {
  entityType: string;
  entityName: string;
  predicate: string;
  text: string;
  value: string | null;
  confidence: number;
  sourceTitles: string[];
}

export interface RelationshipPromptContext {
  relationshipLines: string[];
  styleLines: string[];
  memoryLines: string[];
}

export interface UserPersonaInput {
  id: string;
  tenantId: string;
  userId: string;
  status?: KnowledgeStatus;
}

export interface PersonaEvidenceInput {
  id: string;
  tenantId: string;
  userId: string;
  sourceType: string;
  sourceId?: string | null;
  title: string;
  summary: string;
  status?: KnowledgeStatus;
  visibility?: PrivacyScope;
}

export interface PersonaSignalInput {
  tenantId: string;
  userId: string;
  personaId: string;
  kind: PersonaSignalKind;
  key: string;
  label: string;
  weight?: number;
  confidence?: number;
  status?: KnowledgeStatus;
  evidenceId?: string | null;
}

export interface PersonaPromptContext {
  traitLines: string[];
  styleLines: string[];
  preferenceLines: string[];
  capabilityLines: string[];
  conflictStyleLines: string[];
  evidenceLines: string[];
}
