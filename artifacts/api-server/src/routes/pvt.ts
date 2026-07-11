import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../lib/auth";
import { getPvtWallet, listPvtTransactions } from "../lib/pvt";

const router: IRouter = Router();

const transactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

router.get("/pvt/wallet", requireAuth, async (req, res): Promise<void> => {
  res.json(await getPvtWallet(req.dbUser!.id));
});

router.get("/pvt/transactions", requireAuth, async (req, res): Promise<void> => {
  const parsed = transactionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid", message: "잘못된 요청이에요." });
    return;
  }
  res.json(await listPvtTransactions(req.dbUser!.id, parsed.data.limit ?? 50));
});

export default router;
