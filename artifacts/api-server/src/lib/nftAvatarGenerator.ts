import { toFile } from "openai";
import { getOpenAI } from "./aiClient";
import { ObjectStorageService } from "./objectStorage";
import type { NftReferenceImage } from "./nftReferenceImage";

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
  referenceImage: NftReferenceImage;
}

function buildPrompt(input: NftStageAvatarInput): string {
  const traits = input.retainedTraits.length > 0
    ? input.retainedTraits.join(", ")
    : "facial identity, signature colors, silhouette, core accessories";

  return [
    "Create exactly one production-ready, full-body 3D game avatar character by transforming the supplied NFT reference image.",
    "The supplied NFT image is authoritative, not loose inspiration. Keep the same species, face, head shape, horns or ears, eyes, mouth, skin or fur colors, hairstyle, signature clothing details, and overall visual identity.",
    "Infer a fitting full-body anatomy from the NFT design. Preserve its apparent build and proportions: stocky characters must remain stocky, slender characters must remain slender, and stylized head-to-body ratios must remain consistent.",
    "Do not replace an animal, creature, mascot, robot, or non-human NFT with a generic human body.",
    `IP: ${input.ipName}.`,
    `Role: ${input.roleName || "character hero"}.`,
    `World style: ${input.worldStyle || "stylized premium game character"}.`,
    `Growth stage: level ${input.minLevel}, ${input.stageTitle}.`,
    `Stage description: ${input.stageDescription}.`,
    input.stageImagePrompt ? `Stage art direction: ${input.stageImagePrompt}.` : "",
    `Identity traits that must remain recognizable across every growth stage: ${traits}.`,
    "Show the complete character from head to toe, centered, with comfortable empty space around the silhouette.",
    "Use a natural three-quarter pose and polished stylized 3D rendering while staying as visually close as possible to the reference NFT.",
    "Growth changes may enhance outfit, equipment, materials, and stage-specific details, but must not change the core identity, species, face, body type, or signature traits.",
    "BACKGROUND REQUIREMENT: use one perfectly flat, uniform, opaque chroma-key green background with exact color #00FF00.",
    "Do not add scenery, props outside the character, floor, platform, horizon, gradient, texture, glow, fog, or cast shadow to the background.",
    "Do not use chroma-key green or colors close to #00FF00 anywhere on the character, clothing, hair, eyes, accessories, effects, or outlines.",
    "No text, logo, watermark, border, frame, UI, multiple characters, or cropped body parts.",
  ].filter(Boolean).join("\n");
}

export async function generateNftStageAvatar(input: NftStageAvatarInput): Promise<string> {
  const extension = input.referenceImage.contentType === "image/png"
    ? "png"
    : input.referenceImage.contentType === "image/webp"
      ? "webp"
      : "jpg";
  const reference = await toFile(input.referenceImage.data, `nft-reference.${extension}`, {
    type: input.referenceImage.contentType,
  });
  const response = await getOpenAI().images.edit({
    model: process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_MODEL,
    image: reference,
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
