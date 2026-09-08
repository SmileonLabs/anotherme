export interface SafeLinkPreviewFailureLog {
  messageId: string;
  targetOrigin: string | null;
  errorName: string;
  errorCode?: string;
}

function safeErrorName(error: unknown): string {
  if (!error || typeof error !== "object" || !("name" in error)) return "Error";
  const value = String((error as { name?: unknown }).name ?? "");
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value) ? value : "Error";
}

function safeErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const value = String((error as { code?: unknown }).code ?? "");
  return /^[A-Z0-9_-]{1,48}$/.test(value) ? value : null;
}

function safeOrigin(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

/**
 * Builds an allowlisted log payload. Error messages/stacks/causes are omitted
 * because fetch implementations can embed the complete signed URL in them.
 */
export function buildLinkPreviewFailureLog(
  error: unknown,
  rawUrl: string,
  messageId: string,
): SafeLinkPreviewFailureLog {
  const errorCode = safeErrorCode(error);
  return {
    messageId,
    targetOrigin: safeOrigin(rawUrl),
    errorName: safeErrorName(error),
    ...(errorCode ? { errorCode } : {}),
  };
}

export function buildLinkPreviewRoomFailureLog(
  error: unknown,
  roomId: string,
  messageId: string,
): Omit<SafeLinkPreviewFailureLog, "targetOrigin"> & { roomId: string } {
  const { targetOrigin: _targetOrigin, ...safeError } =
    buildLinkPreviewFailureLog(error, "", messageId);
  return { roomId, ...safeError };
}
