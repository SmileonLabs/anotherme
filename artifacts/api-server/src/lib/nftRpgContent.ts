import type { NftCollection, NftEvolutionStage } from "@workspace/db";

export const REQUIRED_EVOLUTION_STAGE_KEYS = [
  "base",
  "growth_1",
  "awakening",
  "advanced",
  "signature",
  "ultimate",
] as const;

export interface NftRpgMission {
  id: string;
  title: string;
  description: string;
  xp: number;
}

export interface NftPublishReadiness {
  ready: boolean;
  missing: string[];
}

function normalizeText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function normalizeXp(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(500, Math.trunc(value)));
}

export function normalizeNftRpgMissions(
  collection: Pick<NftCollection, "id" | "ipName" | "rpgBlueprint">,
): NftRpgMission[] {
  const raw = collection.rpgBlueprint;
  const blueprint = raw && typeof raw === "object" ? raw : {};
  const missions = Array.isArray(blueprint.missions) ? blueprint.missions : [];

  return missions.flatMap((mission, index) => {
    const fallbackTitle = `${collection.ipName} 미션 ${index + 1}`;
    if (typeof mission === "string") {
      const title = normalizeText(mission, fallbackTitle, 120);
      return [{
        id: `${collection.id}:mission:${index}`,
        title,
        description: `${collection.ipName}의 ${title} 활동을 완료해 보세요.`,
        xp: 10 + index * 5,
      }];
    }
    if (!mission || typeof mission !== "object") return [];
    const value = mission as Record<string, unknown>;
    const title = normalizeText(value.title, fallbackTitle, 120);
    return [{
      id: `${collection.id}:mission:${index}`,
      title,
      description: normalizeText(
        value.description,
        `${collection.ipName}의 ${title} 활동을 완료해 보세요.`,
        500,
      ),
      xp: normalizeXp(value.xp, 10 + index * 5),
    }];
  });
}

export function getNftPublishReadiness(
  collection: Pick<NftCollection, "rightsStatus" | "aiAnalyzedAt" | "rpgBlueprint">,
  stages: Array<Pick<NftEvolutionStage, "stageKey" | "status" | "imageUrl">>,
): NftPublishReadiness {
  const missing: string[] = [];
  if (collection.rightsStatus !== "verified") missing.push("rights_not_verified");
  if (!collection.aiAnalyzedAt) missing.push("ai_analysis_missing");
  if (!collection.rpgBlueprint || typeof collection.rpgBlueprint !== "object") {
    missing.push("rpg_blueprint_missing");
  }

  const byKey = new Map(stages.map((stage) => [stage.stageKey, stage]));
  for (const key of REQUIRED_EVOLUTION_STAGE_KEYS) {
    const stage = byKey.get(key);
    if (!stage) {
      missing.push(`stage_missing:${key}`);
      continue;
    }
    if (!stage.imageUrl) missing.push(`stage_image_missing:${key}`);
    if (stage.status !== "published") missing.push(`stage_not_published:${key}`);
  }

  return { ready: missing.length === 0, missing };
}
