import { getOpenAI } from "./aiClient";
import { ObjectStorageService } from "./objectStorage";

const DEFAULT_MODEL = "gpt-image-2";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export interface NftStageAvatarInput {
  ipName: string;
  roleName?: string | null;
  worldStyle?: string | null;
  stageTitle: string;
  stageDescription: string;
  stageImagePrompt?: string;
  minLevel: number;
  retainedTraits: string[];
}

function buildPrompt(input: NftStageAvatarInput): string {
  const traits = input.retainedTraits.length > 0
    ? input.retainedTraits.join(", ")
    : "facial identity, signature colors, silhouette, core accessories";

  return [
    "Create exactly one production-ready, full-body 3D game avatar character.",
    `IP: ${input.ipName}.`,
    `Role: ${input.roleName || "character hero"}.`,
    `World style: ${input.worldStyle || "stylized premium game character"}.`,
    `Growth stage: level ${input.minLevel}, ${input.stageTitle}.`,
    `Stage description: ${input.stageDescription}.`,
    input.stageImagePrompt ? `Stage art direction: ${input.stageImagePrompt}.` : "",
    `Identity traits that must remain recognizable across every growth stage: ${traits}.`,
    "Show the complete character from head to toe, centered, with comfortable empty space around the silhouette.",
    "Use a natural three-quarter pose and polished stylized 3D rendering. Preserve a clear, reusable silhouette.",
    "BACKGROUND REQUIREMENT: use one perfectly flat, uniform, opaque chroma-key green background with exact color #00FF00.",
    "Do not add scenery, props outside the character, floor, platform, horizon, gradient, texture, glow, fog, or cast shadow to the background.",
    "Do not use chroma-key green or colors close to #00FF00 anywhere on the character, clothing, hair, eyes, accessories, effects, or outlines.",
    "No text, logo, watermark, border, frame, UI, multiple characters, or cropped body parts.",
  ].filter(Boolean).join("\n");
}

export async function generateNftStageAvatar(input: NftStageAvatarInput): Promise<string> {
  const response = await getOpenAI().images.generate({
    model: process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_MODEL,
    prompt: buildPrompt(input),
    n: 1,
    size: "1024x1536",
    quality: "medium",
    background: "opaque",
    output_format: "png",
  });

  const encoded = response.data?.[0]?.b64_json;
  if (!encoded) {
    throw new Error("Image generation returned no image data");
  }

  const image = Buffer.from(encoded, "base64");
  if (image.length === 0 || image.length > MAX_IMAGE_BYTES) {
    throw new Error("Generated image has an invalid size");
  }

  return new ObjectStorageService().uploadObjectEntity(image, "image/png");
}
