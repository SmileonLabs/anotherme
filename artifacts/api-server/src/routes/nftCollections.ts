import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, nftCollectionsTable, nftEvolutionStagesTable, NFT_COLLECTION_STATUSES } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { hasAdminAccess } from "../lib/adminRbac";
import { analyzeNftRpg } from "../lib/nftRpgAnalyzer";

const router: IRouter = Router();
const categorySchema = z.enum(["idol", "sports", "comic", "character", "other"]);
const createSchema = z.object({
  chainId: z.number().int().positive(),
  contractAddress: z.string().trim().min(1).max(120),
  rpcUrl: z.string().url().optional(),
  name: z.string().trim().min(1).max(160),
  ipName: z.string().trim().min(1).max(160),
  category: categorySchema.default("character"),
  officialUrl: z.string().url().optional(),
  metadataUrl: z.string().url().optional(),
  rightsStatus: z.enum(["review_required", "verified", "rejected"]).default("review_required"),
});

async function requireAdmin(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1]): Promise<boolean> {
  if (!req.dbUser || !(await hasAdminAccess(req.dbUser))) { res.status(403).json({ error: "admin_required" }); return false; }
  return true;
}

function blueprint(category: z.infer<typeof categorySchema>, ipName: string) {
  const common = {
    ipName,
    category,
    stages: [1, 5, 10, 20, 30, 50],
    rewards: ["xp", "stat", "story_unlock"],
  };
  if (category === "sports") return { ...common, roleName: "선수", stats: ["체력", "기술", "팀워크", "경기 경험"], missions: ["훈련", "경기 준비", "전술 분석"], tone: "역동적이고 경쟁적인 스포츠 성장" };
  if (category === "comic") return { ...common, roleName: "주인공", stats: ["용기", "전투력", "탐험", "동료 신뢰"], missions: ["탐험", "에피소드", "라이벌전"], tone: "에피소드 중심의 모험 성장" };
  if (category === "idol") return { ...common, roleName: "아티스트", stats: ["보컬", "퍼포먼스", "매력", "팬심"], missions: ["연습", "무대", "팬 소통"], tone: "무대와 팬 활동 중심의 성장" };
  return { ...common, roleName: "캐릭터", stats: ["능력", "관계", "탐험", "세계관"], missions: ["일일 퀘스트", "에피소드", "관계 활동"], tone: "IP 세계관에 맞춘 캐릭터 성장" };
}

router.get("/nft/collections", async (_req, res): Promise<void> => {
  const rows = await db.select().from(nftCollectionsTable).where(eq(nftCollectionsTable.status, "published")).orderBy(desc(nftCollectionsTable.updatedAt));
  res.json(rows);
});

router.get("/nft/collections/:id/evolution", async (req, res): Promise<void> => {
  const rows = await db.select().from(nftEvolutionStagesTable).where(eq(nftEvolutionStagesTable.collectionId, String(req.params.id))).orderBy(nftEvolutionStagesTable.minLevel);
  res.json(rows.filter((stage) => stage.status === "published"));
});

router.get("/nft/collections/:id/rpg-content", async (req, res): Promise<void> => {
  const [collection] = await db.select().from(nftCollectionsTable).where(eq(nftCollectionsTable.id, String(req.params.id))).limit(1);
  if (!collection || collection.status !== "published") { res.status(404).json({ error: "not_found" }); return; }
  const blueprint = collection.rpgBlueprint ?? {};
  const missions = Array.isArray(blueprint.missions) ? blueprint.missions.map((title, index) => ({ id: `${collection.id}:mission:${index}`, title: String(title), description: `${collection.ipName}의 ${String(title)} 활동을 완료해 보세요.`, xp: 10 + index * 5 })) : [];
  res.json({ collectionId: collection.id, ipName: collection.ipName, category: collection.category, roleName: collection.roleName ?? "캐릭터", worldStyle: collection.worldStyle ?? "", missions, story: { opening: `${collection.ipName}의 새로운 성장 이야기가 시작됩니다.`, next: `${collection.roleName ?? "캐릭터"}로서 다음 장면을 준비해 보세요.` } });
});

router.patch("/admin/nft/collections/:collectionId/evolution/:stageKey", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = z.object({ minLevel: z.number().int().min(1).max(100).optional(), title: z.string().trim().min(1).max(120).optional(), description: z.string().trim().min(1).max(500).optional(), imageUrl: z.string().url().nullable().optional(), status: z.enum(["draft", "approved", "published", "archived"]).optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid", issues: parsed.error.issues }); return; }
  const [updated] = await db.update(nftEvolutionStagesTable).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(nftEvolutionStagesTable.collectionId, String(req.params.collectionId)), eq(nftEvolutionStagesTable.stageKey, String(req.params.stageKey)))).returning();
  if (!updated) { res.status(404).json({ error: "not_found" }); return; }
  res.json(updated);
});

router.get("/admin/nft/collections", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  res.json(await db.select().from(nftCollectionsTable).orderBy(desc(nftCollectionsTable.createdAt)));
});

router.post("/admin/nft/collections", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid", issues: parsed.error.issues }); return; }
  const [row] = await db.insert(nftCollectionsTable).values(parsed.data).onConflictDoUpdate({
    target: [nftCollectionsTable.chainId, nftCollectionsTable.contractAddress],
    set: { ...parsed.data, updatedAt: new Date() },
  }).returning();
  res.status(201).json(row);
});

// OpenAI-backed analysis handler. It is registered before the legacy fallback below.
router.post("/admin/nft/collections/:id/analyze", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const id = String(req.params.id);
  const [collection] = await db.select().from(nftCollectionsTable).where(eq(nftCollectionsTable.id, id)).limit(1);
  if (!collection) { res.status(404).json({ error: "not_found" }); return; }
  try {
    const analysis = await analyzeNftRpg({ name: collection.name, ipName: collection.ipName, category: collection.category, chainId: collection.chainId, contractAddress: collection.contractAddress, officialUrl: collection.officialUrl, metadataUrl: collection.metadataUrl });
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(nftCollectionsTable).set({ status: "review_required", roleName: analysis.roleName, worldStyle: analysis.worldStyle, rpgBlueprint: { ...analysis, generatedBy: "openai", model: "gpt-5-mini" }, aiAnalysis: { generatedBy: "openai", model: "gpt-5-mini", generatedAt: new Date().toISOString(), confidence: "draft" }, aiAnalyzedAt: new Date(), updatedAt: new Date() }).where(eq(nftCollectionsTable.id, id)).returning();
      for (const stage of analysis.stages) await tx.insert(nftEvolutionStagesTable).values({ collectionId: id, stageKey: stage.stageKey, minLevel: stage.minLevel, title: stage.title, description: stage.description, retainedTraits: stage.retainedTraits, status: "draft" }).onConflictDoUpdate({ target: [nftEvolutionStagesTable.collectionId, nftEvolutionStagesTable.stageKey], set: { minLevel: stage.minLevel, title: stage.title, description: stage.description, retainedTraits: stage.retainedTraits, status: "draft", updatedAt: new Date() } });
      return updated;
    });
    res.json(result);
  } catch (error) {
    req.log.error({ err: error, collectionId: id }, "NFT RPG AI analysis failed");
    const message = error instanceof Error && error.message.includes("API key") ? "OpenAI API 키가 설정되지 않았어요." : "AI 분석에 실패했어요. 잠시 후 다시 시도해 주세요.";
    res.status(502).json({ error: "ai_analysis_failed", message });
  }
});

// Explicit second step: regenerate only the growth RPG blueprint after the IP review.
router.post("/admin/nft/collections/:id/rpg-analyze", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const id = String(req.params.id);
  const [collection] = await db.select().from(nftCollectionsTable).where(eq(nftCollectionsTable.id, id)).limit(1);
  if (!collection) { res.status(404).json({ error: "not_found" }); return; }
  if (!collection.aiAnalyzedAt) { res.status(409).json({ error: "ip_analysis_required" }); return; }
  try {
    const analysis = await analyzeNftRpg({ name: collection.name, ipName: collection.ipName, category: collection.category, chainId: collection.chainId, contractAddress: collection.contractAddress, officialUrl: collection.officialUrl, metadataUrl: collection.metadataUrl });
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(nftCollectionsTable).set({ roleName: analysis.roleName, worldStyle: analysis.worldStyle, rpgBlueprint: { ...analysis, generatedBy: "openai", model: "gpt-5-mini" }, updatedAt: new Date() }).where(eq(nftCollectionsTable.id, id)).returning();
      for (const stage of analysis.stages) await tx.insert(nftEvolutionStagesTable).values({ collectionId: id, stageKey: stage.stageKey, minLevel: stage.minLevel, title: stage.title, description: stage.description, retainedTraits: stage.retainedTraits, status: "draft" }).onConflictDoUpdate({ target: [nftEvolutionStagesTable.collectionId, nftEvolutionStagesTable.stageKey], set: { minLevel: stage.minLevel, title: stage.title, description: stage.description, retainedTraits: stage.retainedTraits, status: "draft", updatedAt: new Date() } });
      return updated;
    });
    res.json(result);
  } catch (error) {
    req.log.error({ err: error, collectionId: id }, "NFT growth RPG AI analysis failed");
    res.status(502).json({ error: "rpg_analysis_failed", message: "성장 RPG 테마 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." });
  }
});

// Legacy deterministic fallback is kept below for rollback safety.
router.post("/admin/nft/collections/:id/analyze-legacy", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const id = String(req.params.id);
  const [collection] = await db.select().from(nftCollectionsTable).where(eq(nftCollectionsTable.id, id)).limit(1);
  if (!collection) { res.status(404).json({ error: "not_found" }); return; }
  const rpgBlueprint = blueprint(categorySchema.catch("character").parse(collection.category), collection.ipName);
  const stages = [
    ["base", 1, "기본 모습"], ["growth_1", 5, "첫 성장"], ["awakening", 10, "능력 각성"],
    ["advanced", 20, "고급 성장"], ["signature", 30, "대표 성장"], ["ultimate", 50, "스페셜 폼"],
  ] as const;
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(nftCollectionsTable).set({ status: "review_required", roleName: rpgBlueprint.roleName, worldStyle: rpgBlueprint.tone, rpgBlueprint, aiAnalysis: { generatedBy: "anotherme-rpg-analyzer-v1", generatedAt: new Date().toISOString(), confidence: "draft" }, aiAnalyzedAt: new Date(), updatedAt: new Date() }).where(eq(nftCollectionsTable.id, id)).returning();
    for (const [stageKey, minLevel, title] of stages) await tx.insert(nftEvolutionStagesTable).values({ collectionId: id, stageKey, minLevel, title, description: `${collection.ipName}의 ${title} 단계`, retainedTraits: ["face", "signature_color", "signature_trait"], status: "draft" }).onConflictDoUpdate({ target: [nftEvolutionStagesTable.collectionId, nftEvolutionStagesTable.stageKey], set: { minLevel, title, updatedAt: new Date() } });
    return updated;
  });
  res.json(result);
});

router.post("/admin/nft/collections/:id/review", requireAuth, async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = z.object({ action: z.enum(["approve", "reject", "publish", "suspend"]), roleName: z.string().trim().max(80).optional(), worldStyle: z.string().trim().max(300).optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid" }); return; }
  const status = parsed.data.action === "approve" ? "approved" : parsed.data.action === "publish" ? "published" : parsed.data.action === "suspend" ? "suspended" : "rejected";
  const [row] = await db.update(nftCollectionsTable).set({ status, ...(parsed.data.roleName ? { roleName: parsed.data.roleName } : {}), ...(parsed.data.worldStyle ? { worldStyle: parsed.data.worldStyle } : {}), reviewedAt: new Date(), updatedAt: new Date() }).where(eq(nftCollectionsTable.id, String(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "not_found" }); return; }
  res.json(row);
});

export default router;
