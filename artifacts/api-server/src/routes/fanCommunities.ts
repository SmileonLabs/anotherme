import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db, fanCommunitiesTable, fanCommunityMembersTable, starProfilesTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
const createSchema = z.object({ starProfileId: z.uuid(), name: z.string().trim().min(1).max(80), description: z.string().trim().max(500).optional() });

router.get("/fan-communities", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select({ id: fanCommunitiesTable.id, starProfileId: fanCommunitiesTable.starProfileId, name: fanCommunitiesTable.name, description: fanCommunitiesTable.description, memberCount: sql<number>`count(${fanCommunityMembersTable.userId})::int` })
    .from(fanCommunitiesTable).leftJoin(fanCommunityMembersTable, eq(fanCommunityMembersTable.communityId, fanCommunitiesTable.id)).where(eq(fanCommunitiesTable.status, "ACTIVE")).groupBy(fanCommunitiesTable.id).orderBy(desc(fanCommunitiesTable.createdAt));
  res.json(rows);
});

router.post("/fan-communities", requireAuth, async (req, res): Promise<void> => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid" }); return; }
  const [profile] = await db.select({ userId: starProfilesTable.userId }).from(starProfilesTable).where(eq(starProfilesTable.id, parsed.data.starProfileId)).limit(1);
  if (!profile) { res.status(404).json({ error: "star_not_found" }); return; }
  if (profile.userId !== req.dbUser!.id) { res.status(403).json({ error: "not_owner" }); return; }
  const [community] = await db.insert(fanCommunitiesTable).values({ starProfileId: parsed.data.starProfileId, name: parsed.data.name, description: parsed.data.description ?? "" }).returning();
  await db.insert(fanCommunityMembersTable).values({ communityId: community.id, userId: req.dbUser!.id, role: "OWNER" });
  res.status(201).json(community);
});

router.post("/fan-communities/:id/join", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!z.uuid().safeParse(id).success) { res.status(400).json({ error: "invalid" }); return; }
  const [community] = await db.select({ id: fanCommunitiesTable.id }).from(fanCommunitiesTable).where(and(eq(fanCommunitiesTable.id, id), eq(fanCommunitiesTable.status, "ACTIVE"))).limit(1);
  if (!community) { res.status(404).json({ error: "not_found" }); return; }
  await db.insert(fanCommunityMembersTable).values({ communityId: id, userId: req.dbUser!.id }).onConflictDoNothing();
  res.json({ joined: true });
});

router.delete("/fan-communities/:id/join", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!z.uuid().safeParse(id).success) { res.status(400).json({ error: "invalid" }); return; }
  await db.delete(fanCommunityMembersTable).where(and(eq(fanCommunityMembersTable.communityId, id), eq(fanCommunityMembersTable.userId, req.dbUser!.id), sql`${fanCommunityMembersTable.role} <> 'OWNER'`));
  res.json({ joined: false });
});

export default router;
