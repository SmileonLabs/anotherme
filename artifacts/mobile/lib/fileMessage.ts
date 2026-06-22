/**
 * File messages store their metadata as JSON in the message `content` (no DB
 * migration needed — same approach as image/sticker messages). The `path`
 * always points at an internal object (`/objects/<id>`); name/size are shown in
 * the chat bubble.
 */
export interface FileMeta {
  path: string;
  name: string;
  size: number;
  mime?: string;
}

export function encodeFileContent(meta: FileMeta): string {
  return JSON.stringify({
    path: meta.path,
    name: meta.name,
    size: meta.size,
    mime: meta.mime,
  });
}

export function parseFileContent(content: string): FileMeta | null {
  try {
    const o = JSON.parse(content) as Record<string, unknown>;
    if (
      o &&
      typeof o.path === "string" &&
      o.path.startsWith("/objects/") &&
      typeof o.name === "string"
    ) {
      return {
        path: o.path,
        name: o.name,
        size: typeof o.size === "number" ? o.size : 0,
        mime: typeof o.mime === "string" ? o.mime : undefined,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 1) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}
