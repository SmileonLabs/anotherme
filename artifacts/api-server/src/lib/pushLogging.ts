export interface SafePushFailureLog {
  errorName: string;
  errorCode?: string;
  statusCode?: number;
}

const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const SAFE_ERROR_CODE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/;

function safeErrorName(error: unknown): string {
  if (!error || typeof error !== "object" || !("name" in error)) return "Error";
  const value = String((error as { name?: unknown }).name ?? "");
  return SAFE_ERROR_NAME.test(value) ? value : "Error";
}

function safeErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const candidate =
    (error as { code?: unknown }).code ??
    (error as { errorInfo?: { code?: unknown } }).errorInfo?.code;
  const value = String(candidate ?? "");
  return SAFE_ERROR_CODE.test(value) ? value : null;
}

function safeStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const value = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isSafeInteger(value) && value >= 100 && value <= 599
    ? value
    : null;
}

/**
 * Push provider errors may contain a complete capability endpoint, device token,
 * response body, headers, or those values repeated in message/stack fields.
 * Copy only bounded categorical fields into the persistent application log.
 */
export function buildPushFailureLog(error: unknown): SafePushFailureLog {
  const errorCode = safeErrorCode(error);
  const statusCode = safeStatusCode(error);
  return {
    errorName: safeErrorName(error),
    ...(errorCode ? { errorCode } : {}),
    ...(statusCode !== null ? { statusCode } : {}),
  };
}
