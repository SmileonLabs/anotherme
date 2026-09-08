export interface PushRegistrationOwnerToken {
  ownerId: string;
  generation: number;
}

const DEFAULT_PUSH_CLEANUP_TIMEOUT_MS = 10_000;

/**
 * Serialises one physical device's registrations. If account A's request is
 * already on the wire when the app switches to B, B is guaranteed to run after
 * A and become the final server owner. Work queued for an owner that became
 * stale before it started is skipped.
 */
export class PushRegistrationCoordinator {
  private ownerId: string | null = null;
  private generation = 0;
  private tail: Promise<void> = Promise.resolve();

  setOwner(ownerId: string | null): PushRegistrationOwnerToken | null {
    if (this.ownerId !== ownerId) {
      this.ownerId = ownerId;
      this.generation += 1;
    }
    return ownerId ? { ownerId, generation: this.generation } : null;
  }

  capture(): PushRegistrationOwnerToken | null {
    return this.ownerId
      ? { ownerId: this.ownerId, generation: this.generation }
      : null;
  }

  isCurrent(token: PushRegistrationOwnerToken): boolean {
    return (
      this.ownerId === token.ownerId && this.generation === token.generation
    );
  }

  clearIfCurrent(token: PushRegistrationOwnerToken): boolean {
    if (!this.isCurrent(token)) return false;
    this.setOwner(null);
    return true;
  }

  enqueue(
    token: PushRegistrationOwnerToken,
    register: () => Promise<unknown>,
  ): Promise<boolean> {
    const execution = this.tail
      .catch(() => undefined)
      .then(async () => {
        if (!this.isCurrent(token)) return false;
        await register();
        return this.isCurrent(token);
      });
    this.tail = execution.then(
      () => undefined,
      () => undefined,
    );
    return execution;
  }


  /** Queue owner-scoped revocation after any registration already on the wire. */
  enqueueCleanup(
    cleanup: () => Promise<unknown>,
    timeoutMs = DEFAULT_PUSH_CLEANUP_TIMEOUT_MS,
  ): Promise<void> {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
      throw new TypeError("timeoutMs must be positive");
    }
    const execution = this.tail
      .catch(() => undefined)
      .then(async () => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        try {
          await Promise.race([
            Promise.resolve().then(cleanup),
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, timeoutMs);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      });
    this.tail = execution.catch(() => undefined);
    return execution;
  }
}

// Web settings/registrar and native settings/registrar never coexist in one
// runtime, but each platform must share one queue across all registration UI.
export const pushRegistrationCoordinator = new PushRegistrationCoordinator();
