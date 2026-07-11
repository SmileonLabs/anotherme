import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { redisReady } from "../lib/redis";

const router: IRouter = Router();

router.get("/healthz", async (_req, res): Promise<void> => {
  const [database, redis] = await Promise.allSettled([pool.query("SELECT 1"), redisReady()]);
  if (database.status !== "fulfilled" || redis.status !== "fulfilled" || !redis.value) {
    res.status(503).json({ status: "unavailable" });
    return;
  }
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
