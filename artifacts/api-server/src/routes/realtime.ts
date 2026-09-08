import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import { isAllowedOrigin, normalizeOrigin } from "../lib/origins";
import {
  RealtimeTicketUnavailableError,
  issueRealtimeTicket,
} from "../lib/realtime";
import { rateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

router.post("/realtime/ticket", requireAuth, rateLimit({ name: "realtime-ticket", limit: 20, windowSeconds: 60, requireRedis: true }), async (req, res): Promise<void> => {
  const rawOrigin = req.get("origin");
  const origin = normalizeOrigin(rawOrigin);
  if (rawOrigin && (!origin || !isAllowedOrigin(origin))) {
    res.status(403).json({ error: "Origin is not allowed" });
    return;
  }

  try {
    const ticket = await issueRealtimeTicket(req.dbUser!.id, origin);
    res.set("Cache-Control", "no-store");
    res.json({ ticket });
  } catch (err) {
    if (err instanceof RealtimeTicketUnavailableError) {
      res.status(503).json({ error: "Realtime is temporarily unavailable" });
      return;
    }
    throw err;
  }
});

export default router;
