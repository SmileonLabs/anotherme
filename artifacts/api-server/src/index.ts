import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { attachRealtimeServer } from "./lib/realtime";
import { startOntologySyncWorker } from "./lib/ontologySync";

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
attachRealtimeServer(server);

server.once("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

// PostgreSQL migrations and Neo4j schema/seed writes run through one-shot jobs
// before replicas start. App startup only begins request-serving workers.
startOntologySyncWorker(logger);

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
