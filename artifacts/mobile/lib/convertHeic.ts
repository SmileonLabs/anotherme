export interface ConvertedImage {
  blob: Blob;
  name: string;
  contentType: string;
}

/**
 * Native passthrough. Expo's iOS image picker already hands back a usable
 * format, and Android doesn't produce HEIC here, so there's nothing to convert.
 * The web implementation (`convertHeic.web.ts`) does the real HEIC→JPEG work.
 */
export async function convertHeicIfNeeded(
  blob: Blob,
  name: string,
  contentType: string,
): Promise<ConvertedImage> {
  return { blob, name, contentType };
}
