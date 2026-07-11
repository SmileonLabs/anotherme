export function isTerminalCallStatus(status: string): boolean {
  return (
    status === "ended" ||
    status === "declined" ||
    status === "missed" ||
    status === "cancelled" ||
    status === "failed"
  );
}

export function callDurationSec(acceptedAt: Date | null | undefined, endedAt: Date | null | undefined): number | null {
  if (!acceptedAt || !endedAt) return null;
  return Math.max(0, Math.round((endedAt.getTime() - acceptedAt.getTime()) / 1000));
}
