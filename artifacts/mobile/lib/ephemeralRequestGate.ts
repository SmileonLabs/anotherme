export interface EphemeralRequestGateOptions {
  minIntervalMs: number;
  timeoutMs: number;
  now?: () => number;
  onPendingChange?: (pending: boolean) => void;
}

/**
 * Backpressure for disposable signals such as typing and presence. While one
 * request is pending, newer signals are dropped (never queued for replay).
 */
export class EphemeralRequestGate {
  private readonly options: EphemeralRequestGateOptions;
  private readonly now: () => number;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private lastStartedAt = Number.NEGATIVE_INFINITY;
  private disposed = false;

  constructor(options: EphemeralRequestGateOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  get pending(): boolean {
    return this.controller !== null;
  }

  tryRun(operation: (signal: AbortSignal) => Promise<unknown>): boolean {
    const now = this.now();
    if (
      this.disposed ||
      this.controller ||
      now - this.lastStartedAt < this.options.minIntervalMs
    ) {
      return false;
    }

    this.lastStartedAt = now;
    const controller = new AbortController();
    const generation = ++this.generation;
    this.controller = controller;
    this.options.onPendingChange?.(true);

    this.timer = setTimeout(() => {
      if (generation !== this.generation) return;
      controller.abort();
      this.clearCurrent(generation);
    }, this.options.timeoutMs);

    void operation(controller.signal)
      .catch(() => undefined)
      .finally(() => this.clearCurrent(generation));
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.controller?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.controller) this.options.onPendingChange?.(false);
    this.controller = null;
  }

  private clearCurrent(generation: number): void {
    // The timeout path clears the operation before its promise settles. Ignore
    // that later `finally` so pending metrics/state are not decremented twice.
    if (generation !== this.generation || !this.controller) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.controller = null;
    this.options.onPendingChange?.(false);
  }
}
