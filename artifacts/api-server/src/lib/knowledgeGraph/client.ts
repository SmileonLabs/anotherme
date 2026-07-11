import neo4j, { type Driver, type ManagedTransaction } from "neo4j-driver";
import { logger as defaultLogger } from "../logger";

let driver: Driver | null | undefined;

function getNeo4jConfig(): { uri: string; user: string; password: string } | null {
  const uri = process.env.NEO4J_URI?.trim();
  const user = process.env.NEO4J_USER?.trim();
  const password = process.env.NEO4J_PASSWORD ?? "";
  if (!uri || !user || !password) return null;
  return { uri, user, password };
}

export function getKnowledgeGraphDriver(): Driver | null {
  if (driver !== undefined) return driver;
  const config = getNeo4jConfig();
  if (!config) {
    driver = null;
    return null;
  }

  driver = neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password));
  return driver;
}

export async function closeKnowledgeGraphDriver(): Promise<void> {
  if (!driver) return;
  await driver.close();
  driver = undefined;
}

export async function verifyKnowledgeGraphConnection(): Promise<boolean> {
  const activeDriver = getKnowledgeGraphDriver();
  if (!activeDriver) return false;
  try {
    await activeDriver.verifyConnectivity();
    return true;
  } catch (err) {
    defaultLogger.warn({ err }, "Knowledge graph unavailable; continuing without Neo4j");
    return false;
  }
}

export async function runKnowledgeGraphWrite<T>(
  fn: (tx: ManagedTransaction) => Promise<T>,
): Promise<T | null> {
  const activeDriver = getKnowledgeGraphDriver();
  if (!activeDriver) return null;
  const session = activeDriver.session();
  try {
    return await session.executeWrite(fn);
  } catch (err) {
    defaultLogger.warn({ err }, "Knowledge graph write failed");
    return null;
  } finally {
    await session.close();
  }
}

export async function runKnowledgeGraphRead<T>(
  fn: (tx: ManagedTransaction) => Promise<T>,
): Promise<T | null> {
  const activeDriver = getKnowledgeGraphDriver();
  if (!activeDriver) return null;
  const session = activeDriver.session();
  try {
    return await session.executeRead(fn);
  } catch (err) {
    defaultLogger.warn({ err }, "Knowledge graph read failed");
    return null;
  } finally {
    await session.close();
  }
}
