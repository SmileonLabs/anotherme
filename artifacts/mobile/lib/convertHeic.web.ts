export interface ConvertedImage {
  blob: Blob;
  name: string;
  contentType: string;
}

function isHeic(name: string, contentType: string): boolean {
  const ct = contentType.toLowerCase();
  // Covers heic/heif plus the *-sequence variants some devices report.
  if (ct.startsWith("image/heic") || ct.startsWith("image/heif")) return true;
  // Browsers frequently report an empty or generic type for HEIC files, so fall
  // back to the filename extension.
  return /\.(heic|heif)$/i.test(name);
}

/**
 * iPhone photos arrive as HEIC, which Chrome/Firefox/Android browsers cannot
 * render — recipients would see a broken image (or the server would force a
 * download, since HEIC isn't an inline-safe type). Convert to JPEG in the
 * browser before upload so the photo displays everywhere.
 */
export async function convertHeicIfNeeded(
  blob: Blob,
  name: string,
  contentType: string,
): Promise<ConvertedImage> {
  if (!isHeic(name, contentType)) return { blob, name, contentType };
  try {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.8 });
    const jpeg = (Array.isArray(out) ? out[0] : out) as Blob;
    const renamed = name.replace(/\.(heic|heif)$/i, ".jpg");
    const finalName = /\.jpe?g$/i.test(renamed) ? renamed : `${renamed}.jpg`;
    return { blob: jpeg, name: finalName, contentType: "image/jpeg" };
  } catch {
    // Conversion failed (corrupt file, unsupported variant, …) — fall back to
    // the original so the upload still succeeds. Safari can render HEIC; other
    // browsers will at least offer it as a download.
    return { blob, name, contentType };
  }
}
