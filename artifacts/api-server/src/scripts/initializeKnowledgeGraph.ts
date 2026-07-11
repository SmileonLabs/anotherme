import { logger } from "../lib/logger";
import { ensureBibiKnowledgeGraphSeed } from "../lib/knowledgeGraph/bibiSeed";
import {
  closeKnowledgeGraphDriver,
  getKnowledgeGraphDriver,
  verifyKnowledgeGraphConnection,
} from "../lib/knowledgeGraph/client";
import { ensureKnowledgeGraphSchema } from "../lib/knowledgeGraph/schema";

try {
  if (!getKnowledgeGraphDriver()) {
    logger.info("Neo4j is not configured; skipping knowledge graph initialization");
  } else if (!(await verifyKnowledgeGraphConnection())) {
    throw new Error("Neo4j is configured but unavailable");
  } else {
    await ensureKnowledgeGraphSchema();
    await ensureBibiKnowledgeGraphSeed();
    logger.info("Knowledge graph schema and BIBI seed initialization completed");
  }
} finally {
  await closeKnowledgeGraphDriver();
}
