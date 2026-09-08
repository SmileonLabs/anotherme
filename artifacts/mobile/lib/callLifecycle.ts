export type CallMode = "idle" | "outgoing" | "incoming" | "joining" | "active";

const TERMINAL_STATUSES = new Set(["declined", "ended", "missed", "cancelled", "failed"]);

export function isTerminalCallStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && TERMINAL_STATUSES.has(status);
}

export function watchedCallId(args: {
  mode: CallMode;
  activeCallId?: string | null;
  incomingCallId?: string | null;
}): string {
  if (args.mode === "incoming") return args.incomingCallId ?? "";
  if (args.mode === "outgoing" || args.mode === "joining" || args.mode === "active") {
    return args.activeCallId ?? "";
  }
  return "";
}

export function callPollingInterval(mode: CallMode): number {
  return mode === "active" ? 10_000 : 2_500;
}
