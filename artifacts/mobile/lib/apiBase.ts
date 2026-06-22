/**
 * Resolve the API host. On native we talk to the remote API server via an
 * absolute URL (mirrors setBaseUrl in _layout.tsx); on web requests are
 * same-origin so a relative path is enough.
 */
export function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

/**
 * Build a displayable URL for an image message. Image messages store the
 * canonical object path (`/objects/<id>`) in `content`; the server serves it
 * under `/api/storage/objects/<id>`.
 */
export function mediaUri(content: string): string {
  if (!content) return content;
  if (/^https?:\/\//.test(content) || content.startsWith("blob:") || content.startsWith("data:")) {
    return content;
  }
  const path = content.startsWith("/objects/") ? `/api/storage${content}` : content;
  return `${getApiBase()}${path}`;
}
