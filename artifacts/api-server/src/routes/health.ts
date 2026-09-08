import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { redisReady } from "../lib/redis";

const router: IRouter = Router();

router.get("/healthz", async (_req, res): Promise<void> => {
  // Capacity is monitored on the host by anotherme-disk-monitor. Do not turn a
  // host-level warning into a simultaneous readiness failure for both API
  // replicas; that would create an outage while the service is still usable.
  const [database, redis] = await Promise.allSettled([
    pool.query("SELECT 1"),
    redisReady(),
  ]);
  if (
    database.status !== "fulfilled" ||
    redis.status !== "fulfilled" ||
    !redis.value
  ) {
    res.status(503).json({ status: "unavailable" });
    return;
  }
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
