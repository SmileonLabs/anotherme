import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { officialAiAccountsTable } from "../../../../lib/db/src/schema/officialAi";
import { requireAuth } from "../lib/auth";
import { hasAdminAccess } from "../lib/adminRbac";
import {
  BIBI_OFFICIAL_CHARACTER_IMAGE_URL,
  ensureBibiFriendshipForUser,
  getBibiOfficialProfile,
  getOrCreateBibiDirectRoom,
} from "../lib/officialAccounts";
import { roomWithMeta } from "./rooms";

const router: IRouter = Router();

router.get("/official-ai-accounts", requireAuth, async (_req, res): Promise<void> => {
  res.json(await db.select().from(officialAiAccountsTable).where(eq(officialAiAccountsTable.status, "published")).orderBy(desc(officialAiAccountsTable.updatedAt)));
});

router.get("/official-ai-accounts/:slug/runtime", requireAuth, async (req, res): Promise<void> => {
  const [account] = await db.select().from(officialAiAccountsTable).where(eq(officialAiAccountsTable.slug, String(req.params.slug))).limit(1);
  if (!account || account.status !== "published") { res.status(404).json({ error: "official_ai_not_available" }); return; }
  res.json({ id: account.id, slug: account.slug, displayName: account.displayName, description: account.description, profileImageUrl: account.profileImageUrl, persona: account.personaJson, conversation: account.channelConfigJson, safety: account.safetyPolicyJson });
});

router.get("/admin/official-ai-accounts", requireAuth, async (req, res): Promise<void> => {
  if (!req.dbUser || !(await hasAdminAccess(req.dbUser))) { res.status(403).json({ error: "admin_required" }); return; }
  res.json(await db.select().from(officialAiAccountsTable).orderBy(desc(officialAiAccountsTable.updatedAt)));
});

router.post("/admin/official-ai-accounts", requireAuth, async (req, res): Promise<void> => {
  if (!req.dbUser || !(await hasAdminAccess(req.dbUser))) { res.status(403).json({ error: "admin_required" }); return; }
  const parsed = z.object({
    slug: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,48}$/),
    displayName: z.string().trim().min(1).max(100),
    accountKind: z.string().trim().min(1).max(40).default("service"),
    description: z.string().trim().max(500).optional(),
    ipProfileId: z.string().trim().max(120).optional(),
    knowledgeTenantId: z.string().trim().max(120).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid", issues: parsed.error.issues }); return; }
  try {
    const [created] = await db.insert(officialAiAccountsTable).values({ ...parsed.data, createdByUserId: req.dbUser.id, status: "draft" }).returning();
    res.status(201).json(created);
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") { res.status(409).json({ error: "slug_taken" }); return; }
    throw error;
  }
});

router.post("/admin/official-ai-accounts/:id/review", requireAuth, async (req, res): Promise<void> => {
  if (!req.dbUser || !(await hasAdminAccess(req.dbUser))) { res.status(403).json({ error: "admin_required" }); return; }
  const parsed = z.object({ action: z.enum(["approve", "publish", "suspend", "archive"]) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid" }); return; }
  const status = parsed.data.action === "approve" ? "approved" : parsed.data.action === "publish" ? "published" : parsed.data.action === "suspend" ? "suspended" : "archived";
  const [updated] = await db.update(officialAiAccountsTable).set({ status, approvedByUserId: parsed.data.action === "approve" ? req.dbUser.id : undefined, publishedAt: parsed.data.action === "publish" ? new Date() : undefined, updatedAt: new Date() }).where(eq(officialAiAccountsTable.id, String(req.params.id))).returning();
  if (!updated) { res.status(404).json({ error: "not_found" }); return; }
  res.json(updated);
});

router.patch("/admin/official-ai-accounts/:id", requireAuth, async (req, res): Promise<void> => {
  if (!req.dbUser || !(await hasAdminAccess(req.dbUser))) { res.status(403).json({ error: "admin_required" }); return; }
  const parsed = z.object({
    displayName: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    profileImageUrl: z.string().url().nullable().optional(),
    ipProfileId: z.string().trim().max(120).nullable().optional(),
    knowledgeTenantId: z.string().trim().max(120).nullable().optional(),
    personaJson: z.record(z.string(), z.unknown()).optional(),
    channelConfigJson: z.record(z.string(), z.unknown()).optional(),
    safetyPolicyJson: z.record(z.string(), z.unknown()).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid", issues: parsed.error.issues }); return; }
  const targetId = String(req.params.id);
  const [target] = await db
    .select({ slug: officialAiAccountsTable.slug })
    .from(officialAiAccountsTable)
    .where(eq(officialAiAccountsTable.id, targetId))
    .limit(1);
  if (!target) { res.status(404).json({ error: "not_found" }); return; }
  const changes = target.slug === "bibi"
    ? { ...parsed.data, profileImageUrl: BIBI_OFFICIAL_CHARACTER_IMAGE_URL }
    : parsed.data;
  const [updated] = await db.update(officialAiAccountsTable).set({ ...changes, updatedAt: new Date() }).where(eq(officialAiAccountsTable.id, targetId)).returning();
  if (!updated) { res.status(404).json({ error: "not_found" }); return; }
  res.json(updated);
});

router.get("/official-accounts/bibi", requireAuth, async (req, res): Promise<void> => {
  await ensureBibiFriendshipForUser(req.dbUser!.id);
  res.json(await getBibiOfficialProfile());
});

router.post("/official-accounts/bibi/room", requireAuth, async (req, res): Promise<void> => {
  const userId = req.dbUser!.id;
  const roomId = await getOrCreateBibiDirectRoom(userId);
  const room = await roomWithMeta(roomId, userId);
  res.status(201).json({ account: await getBibiOfficialProfile(), room });
});

export default router;
