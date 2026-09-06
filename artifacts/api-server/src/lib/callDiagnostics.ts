import { z } from "zod/v4";

const MAX_DETAIL_KEYS = 20;
const MAX_DETAIL_STRING_LENGTH = 200;
const SENSITIVE_KEY =
  /(authorization|cookie|token|secret|password|credential|message|content|body|email|phone|text|sdp|candidate|url|identity|user.?id|profile.?id|room.?name)/i;
const SENSITIVE_VALUE = /(?:^bearer\s+|https?:\/\/|wss?:\/\/|eyJ[A-Za-z0-9_-]{8,}\.)/i;
const SAFE_DIAGNOSTIC_LABEL = /^[A-Za-z0-9._:-]+$/;

export const callDiagnosticPhaseSchema = z.string().trim().min(1).max(100).regex(SAFE_DIAGNOSTIC_LABEL);
export const callDiagnosticPlatformSchema = z.string().trim().min(1).max(50).regex(SAFE_DIAGNOSTIC_LABEL);
export const callDiagnosticRoleSchema = z.string().trim().min(1).max(50).regex(SAFE_DIAGNOSTIC_LABEL);

function sanitizeScalar(value: unknown): string | number | boolean | null | undefined {
  if (typeof value === "string") {
    if (SENSITIVE_VALUE.test(value)) return undefined;
    return value.slice(0, MAX_DETAIL_STRING_LENGTH);
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean" || value === null) return value;
  return undefined;
}

/** Defense in depth for diagnostics that may be persisted by the log pipeline. */
export function sanitizeCallDiagnosticDetails(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details).slice(0, MAX_DETAIL_KEYS)) {
    if (key.length > 50 || !SAFE_DIAGNOSTIC_LABEL.test(key) || SENSITIVE_KEY.test(key)) continue;
    if (Array.isArray(value)) {
      const safeItems = value.slice(0, 10).map(sanitizeScalar).filter((item) => item !== undefined);
      if (safeItems.length > 0) sanitized[key] = safeItems;
      continue;
    }
    const safe = sanitizeScalar(value);
    if (safe !== undefined) sanitized[key] = safe;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
