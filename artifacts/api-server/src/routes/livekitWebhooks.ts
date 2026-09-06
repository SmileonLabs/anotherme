import { Router, raw, type IRouter } from "express";
import { handleLiveKitWebhook } from "./calls";

const router: IRouter = Router();

// Signature verification requires the exact request bytes. app.ts mounts this
// router before the global JSON parser.
router.post(
  "/webhooks/livekit",
  raw({ type: ["application/webhook+json", "application/json"], limit: "256kb" }),
  handleLiveKitWebhook,
);

export default router;
