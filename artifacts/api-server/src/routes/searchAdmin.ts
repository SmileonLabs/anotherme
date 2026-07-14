import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, searchTrendingBlocksTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { isKnowledgeAdmin } from "../lib/knowledge/validation";
import { invalidateTrendingSearchCache, normalizeSearchTerm } from "../lib/searchTrending";

const router: IRouter = Router();
const blockSchema = z.object({ term: z.string().trim().min(2).max(80), reason: z.string().trim().max(200).optional() }).strict();

function requireAdmin(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1]): boolean {
  if (!req.dbUser || !isKnowledgeAdmin(req.dbUser)) { res.status(403).json({ error: "admin_required" }); return false; }
  return true;
}

router.get("/search/admin/blocks", requireAuth, async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const rows = await db.select().from(searchTrendingBlocksTable).orderBy(desc(searchTrendingBlocksTable.createdAt));
  res.json(rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })));
});

router.post("/search/admin/blocks", requireAuth, async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const parsed = blockSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_term" }); return; }
  const term = normalizeSearchTerm(parsed.data.term);
  if (!term) { res.status(400).json({ error: "invalid_term" }); return; }
  const [row] = await db.insert(searchTrendingBlocksTable).values({ normalizedTerm: term, reason: parsed.data.reason || "manual", createdBy: req.dbUser!.id }).onConflictDoUpdate({ target: searchTrendingBlocksTable.normalizedTerm, set: { reason: parsed.data.reason || "manual", createdBy: req.dbUser!.id } }).returning();
  await invalidateTrendingSearchCache();
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete("/search/admin/blocks/:term", requireAuth, async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const term = normalizeSearchTerm(req.params.term);
  if (!term) { res.status(400).json({ error: "invalid_term" }); return; }
  await db.delete(searchTrendingBlocksTable).where(eq(searchTrendingBlocksTable.normalizedTerm, term));
  await invalidateTrendingSearchCache();
  res.json({ deleted: true });
});

export default router;
