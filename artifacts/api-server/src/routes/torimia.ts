import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth";
import { getTorimiaState, openTorimia, TorimiaError } from "../lib/torimia";

const router: IRouter = Router();

router.get("/users/me/torimia", requireAuth, async (req, res): Promise<void> => {
  res.json(await getTorimiaState(req.dbUser!.id));
});

router.post("/users/me/torimia/open", requireAuth, async (req, res): Promise<void> => {
  try {
    res.json(await openTorimia(req.dbUser!.id));
  } catch (err) {
    if (err instanceof TorimiaError) {
      res.status(err.code === "star_required" ? 409 : 403).json({
        error: err.code,
        message: err.message,
        state: err.state,
      });
      return;
    }
    req.log.error({ err }, "openTorimia failed");
    res.status(500).json({ error: "internal", message: "토르미아의 문을 열지 못했어요." });
  }
});

export default router;
