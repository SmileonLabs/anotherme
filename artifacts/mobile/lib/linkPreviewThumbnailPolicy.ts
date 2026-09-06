/**
 * The API currently disables link-preview thumbnails rather than exposing a
 * publisher-controlled URL. Keep the client fail-closed as defense in depth so
 * a stale cache or older API response cannot make a message recipient contact
 * an arbitrary third-party image host.
 */
export function linkPreviewThumbnailUri(
  _imageUrl: string | null | undefined,
): string | null {
  return null;
}
