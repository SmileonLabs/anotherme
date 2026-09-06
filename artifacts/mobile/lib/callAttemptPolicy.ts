import type { Call } from "@workspace/api-client-react";

/**
 * Existing calls must reuse the generation created by the server. A legacy
 * call has no durable generation, so callers omit the control header instead
 * of inventing a value that could be mistaken for a newer call attempt.
 */
export function durableCallAttemptId(
  call: Pick<Call, "attemptId">,
): string | undefined {
  return typeof call.attemptId === "string" && call.attemptId.length > 0
    ? call.attemptId
    : undefined;
}

export function canApplyCallCardAction(
  mode: string,
  currentIncomingCallId: string | null | undefined,
  actionCallId: string,
): boolean {
  return mode !== "incoming" || currentIncomingCallId === actionCallId;
}
