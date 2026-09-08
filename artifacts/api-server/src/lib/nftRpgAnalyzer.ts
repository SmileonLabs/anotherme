import { z } from "zod/v4";
import { getOpenAI } from "./aiClient";

const MODEL = "gpt-5-mini";
const analyzerSchema = z.object({
  // The model may localize stage keys or slightly exceed editorial limits.
  // Validate structure here; editorial normalization happens before persistence.
  roleName: z.string().min(1),
  worldStyle: z.string().min(1),
  stats: z.array(z.string().min(1)).min(4).max(6),
  missions: z.array(z.object({ title: z.string().min(1), description: z.string().min(1), xp: z.coerce.number().int().min(1) })).min(3).max(8),
  stages: z.array(z.object({ stageKey: z.string().min(1), minLevel: z.coerce.number().int().min(1), title: z.string().min(1), description: z.string().min(1), imagePrompt: z.string().min(1), retainedTraits: z.array(z.string().min(1)).min(1).max(8) })).length(6),
});
export type NftRpgAnalysis = z.infer<typeof analyzerSchema>;

const responseSchema = {
  type: "object", additionalProperties: false, required: ["roleName", "worldStyle", "stats", "missions", "stages"],
  properties: {
    roleName: { type: "string" }, worldStyle: { type: "string" },
    stats: { type: "array", minItems: 4, maxItems: 6, items: { type: "string" } },
    missions: { type: "array", minItems: 3, maxItems: 8, items: { type: "object", additionalProperties: false, required: ["title", "description", "xp"], properties: { title: { type: "string" }, description: { type: "string" }, xp: { type: "integer" } } } },
    stages: { type: "array", minItems: 6, maxItems: 6, items: { type: "object", additionalProperties: false, required: ["stageKey", "minLevel", "title", "description", "imagePrompt", "retainedTraits"], properties: { stageKey: { type: "string" }, minLevel: { type: "integer" }, title: { type: "string" }, description: { type: "string" }, imagePrompt: { type: "string" }, retainedTraits: { type: "array", items: { type: "string" } } } } },
  },
} as const;

export async function analyzeNftRpg(input: { name: string; ipName: string; category: string; chainId: number; contractAddress: string; officialUrl?: string | null; metadataUrl?: string | null }): Promise<NftRpgAnalysis> {
  const completion = await getOpenAI().chat.completions.create({
    model: MODEL, max_completion_tokens: 5000, reasoning_effort: "low",
    messages: [
      { role: "system", content: "You are AnotherMe's NFT IP and growth RPG designer. Create an original, non-infringing blueprint from supplied collection facts. Do not claim ownership, licensing, official affiliation, or facts not provided. Write all user-facing strings in Korean. Preserve the NFT identity across six stages without copying protected artwork." },
      { role: "user", content: JSON.stringify({ task: "Analyze this NFT collection for admin review and prepare a draft growth RPG blueprint.", collection: input, stageLevels: [1, 5, 10, 20, 30, 50], stageKeys: ["base", "growth_1", "awakening", "advanced", "signature", "ultimate"] }) },
    ],
    response_format: { type: "json_schema", json_schema: { name: "nft_rpg_analysis", strict: true, schema: responseSchema } },
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("nft_rpg_analysis_empty");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("nft_rpg_analysis_invalid_json"); }
  const result = analyzerSchema.safeParse(parsed);
  if (!result.success) throw new Error("nft_rpg_analysis_invalid_schema");
  return result.data;
}
