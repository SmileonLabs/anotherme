export const GOOGLE_SEARCH_MAX_RESULTS = 10;
export const GOOGLE_SEARCH_ENDPOINT = "https://www.googleapis.com/customsearch/v1";

export interface GoogleSearchResult {
  title: string;
  link: string;
  displayLink: string | null;
  snippet: string | null;
  formattedUrl: string | null;
}

export function isKnowledgeAdmin(user: { id: string; email: string }): boolean {
  const allowed = (process.env.KNOWLEDGE_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length > 0 && (
    allowed.includes("*") ||
    allowed.includes(user.id.toLowerCase()) ||
    allowed.includes(user.email.toLowerCase())
  );
}

export function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.round(parsed)));
}

export function requireGoogleSearchConfig() {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY?.trim();
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID?.trim();
  return apiKey && searchEngineId ? { apiKey, searchEngineId } : null;
}

export function normalizeGoogleSearchItem(item: Record<string, unknown>): GoogleSearchResult | null {
  const title = textValue(item.title);
  const link = textValue(item.link);
  if (!title || !link) return null;
  try {
    const url = new URL(link);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return {
    title,
    link,
    displayLink: stringValue(item.displayLink),
    snippet: stringValue(item.snippet),
    formattedUrl: stringValue(item.formattedUrl),
  };
}

export function validateImportUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function confidenceValue(value: unknown, fallback = 70): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(35, Math.min(100, Math.round(parsed)));
}
