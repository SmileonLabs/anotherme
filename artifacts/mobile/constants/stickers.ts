// Animated stickers powered by Google's Noto Animated Emoji set (CC BY 4.0),
// served as animated WebP from the public gstatic CDN. A sticker message stores
// the Noto codepoint (e.g. "1f600" or "2764_fe0f") as `content` with type
// "sticker" — no DB migration needed (mirrors the image-message pattern).

export const STICKER_CODES: readonly string[] = [
  "1f600",
  "1f602",
  "1f603",
  "1f604",
  "1f60a",
  "1f60d",
  "1f618",
  "1f970",
  "1f60e",
  "1f923",
  "1f642",
  "1f643",
  "1f609",
  "1f44d",
  "1f44e",
  "1f44f",
  "1f64f",
  "1f525",
  "2764_fe0f",
  "1f495",
  "1f389",
  "1f622",
  "1f62d",
  "1f621",
  "1f914",
  "1f973",
  "1f44b",
  "1f4af",
  "2728",
  "1f634",
  "1f628",
  "1f631",
  "1f97a",
  "1f60b",
  "1f92a",
  "1f60f",
  "1f612",
  "1f644",
  "1f44c",
  "1f64c",
] as const;

const STICKER_SET = new Set(STICKER_CODES);

/** Whether a string is one of our known Noto sticker codepoints. */
export function isStickerCode(code: string): boolean {
  return STICKER_SET.has(code);
}

/** Animated WebP URL for a given Noto codepoint. */
export function stickerUri(code: string): string {
  return `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.webp`;
}

/** Server-side shape guard: lowercase hex groups joined by "_". */
export const STICKER_CODE_PATTERN = /^[0-9a-f]+(_[0-9a-f]+)*$/;
