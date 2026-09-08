export const REALTIME_TICKET_TIMEOUT_MS = 8_000;
export const REALTIME_SOCKET_OPEN_TIMEOUT_MS = 15_000;

export function realtimeReconnectDelayMs(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt)
    ? Math.max(0, Math.floor(attempt))
    : 0;
  return Math.min(30_000, 1_000 * 2 ** Math.min(safeAttempt, 5));
}

export function canStartRealtimeConnection(input: {
  online: boolean;
  visible: boolean;
  appActive: boolean;
}): boolean {
  return input.online && input.visible && input.appActive;
}

/** Fences every callback/promise continuation to its owning connection. */
export class RealtimeGenerationFence {
  private generation = 0;

  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  invalidate(): void {
    this.generation += 1;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }
}

function abortError(): Error {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}

/**
 * Bounds even a non-cooperative promise. The underlying work may still finish,
 * so callers must also use a generation fence before applying its result.
 */
export async function runWithAbortDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive finite number");
  }

  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(abortError());
      if (controller.signal.aborted) {
        onAbort();
        return;
      }
      controller.signal.addEventListener("abort", onAbort, { once: true });
      void Promise.resolve()
        .then(() => operation(controller.signal))
        .then(resolve, reject)
        .finally(() =>
          controller.signal.removeEventListener("abort", onAbort),
        );
    });
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}
