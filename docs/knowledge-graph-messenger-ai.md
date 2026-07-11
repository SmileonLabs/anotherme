# Messenger AI Knowledge Graph

## Goal

Build a generic graph-first AI knowledge platform for messenger agents. BIBI Official is the first specialization, not a hardcoded core feature.

The platform has two core axes:

- Knowledge graph: what the AI knows.
- Messenger context graph: how this AI should speak to this specific counterpart.

## Storage Split

- Postgres remains the source of truth for users, rooms, messages, settings, auth, and transactional data.
- Neo4j stores ontology entities, relations, claims, sources, relationship context, style, habits, and shared memory.
- Future document chunks and extraction jobs can be tracked in Postgres and linked into Neo4j as approved claims/sources.

## Tenant Model

Graph tenant types:

- `official_account`
- `user_private`
- `relationship`
- `community`
- `system`

All graph data is tenant-scoped. BIBI uses `official_account:<bibiUserId>`.

## Core Node Types

- `GraphTenant`
- `OntologySchema`
- `Entity`
- `Claim`
- `Source`
- `Persona`
- `Memory`
- `Campaign`
- `RelationshipContext`
- `ConversationStyle`
- `InteractionHabit`
- `SharedMemory`

## Status And Privacy

Statuses:

- `draft`
- `approved`
- `rejected`
- `archived`
- `inferred`

Privacy scopes:

- `official_public`
- `public_profile`
- `user_private`
- `relationship_private`
- `system_internal`

Official factual answers should use `approved` claims. Relationship style/memory can use `approved` or safe `inferred` entries only when privacy policy allows it.

## Current MVP Implementation

- Adds Neo4j service to production compose without exposing host ports.
- Adds `neo4j-driver` to the API server.
- Adds fallback-safe Neo4j client and schema bootstrap.
- Adds generic graph core for tenants, schemas, entities, claims, sources, relations, relationship contexts, and prompt retrieval.
- Adds BIBI as a tenant seed/config layer.
- Injects BIBI official graph context into the existing Another Me response path only when owner is BIBI Official.
- Keeps existing response behavior when Neo4j is unavailable or empty.

## Next Steps

1. Add source/document/chunk tables in Postgres.
2. Add extraction jobs that write draft entities/claims/relations into Neo4j.
3. Add admin review UI for claims and source evidence.
4. Add relationship/style extraction from chats with user consent controls.
5. Add user-visible memory controls before enabling general member private graphs.
6. Add campaign/proactive message engine with per-user cooldown and privacy checks.
