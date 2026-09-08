/**
 * Link-preview thumbnails are disabled until the API owns an authenticated,
 * same-origin image proxy with DNS pinning, redirect validation, byte limits
 * and an image content-type allowlist. Returning a publisher-controlled URL
 * would make every message recipient contact that publisher directly, leaking
 * IP/user-agent/referrer timing and allowing tracking pixels.
 *
 * Keep the nullable OpenAPI field for backwards compatibility, but fail closed
 * for both newly extracted metadata and historical database rows.
 */
export function safeLinkPreviewImageUrl(
  _candidate: string | null | undefined,
): null {
  return null;
}
