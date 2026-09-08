export type CallPresencePolicy = {
  initialConnectionGraceMs: number;
  emptyRoomGraceMs: number;
  singleParticipantGraceMs: number;
};

export type CallPresenceDecision = {
  shouldTerminate: boolean;
  participantCount: number;
  deficitSince: Date | null;
  reason: "healthy" | "initial-grace" | "empty-grace" | "single-participant-grace" | "stale-room";
};

export const DEFAULT_CALL_PRESENCE_POLICY: CallPresencePolicy = {
  // Acceptance and the first media connection are asynchronous. Never consider
  // an empty room stale during this initial window.
  initialConnectionGraceMs: 90_000,
  // With nobody in LiveKit, allow SDK reconnect/ICE restart before recovery.
  emptyRoomGraceMs: 120_000,
  // One participant can legitimately wait longer for the other side to recover.
  singleParticipantGraceMs: 300_000,
};

export function classifyLiveKitRoomLookupError(error: unknown): "missing" | "retry" {
  const value = error as { code?: unknown; status?: unknown; message?: unknown } | null;
  if (
    value?.code === 5 ||
    value?.code === "not_found" ||
    value?.status === 404 ||
    (typeof value?.message === "string" && /room[^\n]*not found|not found[^\n]*room/i.test(value.message))
  ) {
    return "missing";
  }
  return "retry";
}

/**
 * Pure policy used by the lifecycle worker. Absence of an app heartbeat is not
 * an input: termination requires repeated, successful LiveKit observations.
 */
export function decideCallPresence(args: {
  acceptedAt: Date | null;
  observedAt: Date;
  expectedParticipantCount: number;
  previousParticipantCount: number | null;
  previousDeficitSince: Date | null;
  policy?: CallPresencePolicy;
}): CallPresenceDecision {
  const policy = args.policy ?? DEFAULT_CALL_PRESENCE_POLICY;
  const count = Math.max(0, Math.min(2, Math.trunc(args.expectedParticipantCount)));
  if (count >= 2) {
    return { shouldTerminate: false, participantCount: count, deficitSince: null, reason: "healthy" };
  }

  // A changed count starts a new continuous observation window. This avoids
  // treating 0 -> 1 progress as if the room had remained empty throughout.
  let deficitSince =
    args.previousDeficitSince && args.previousParticipantCount === count
      ? args.previousDeficitSince
      : args.observedAt;
  if (
    !args.acceptedAt ||
    args.observedAt.getTime() - args.acceptedAt.getTime() < policy.initialConnectionGraceMs
  ) {
    return {
      shouldTerminate: false,
      participantCount: count,
      deficitSince,
      reason: "initial-grace",
    };
  }

  // The media-deficit grace starts after initial connection grace; the two
  // policies must not accidentally overlap into one shorter deadline.
  const initialGraceEndedAt = args.acceptedAt.getTime() + policy.initialConnectionGraceMs;
  if (deficitSince.getTime() < initialGraceEndedAt) {
    deficitSince = new Date(initialGraceEndedAt);
  }

  const graceMs = count === 0 ? policy.emptyRoomGraceMs : policy.singleParticipantGraceMs;
  const stale = args.observedAt.getTime() - deficitSince.getTime() >= graceMs;
  return {
    shouldTerminate: stale,
    participantCount: count,
    deficitSince,
    reason: stale ? "stale-room" : count === 0 ? "empty-grace" : "single-participant-grace",
  };
}
