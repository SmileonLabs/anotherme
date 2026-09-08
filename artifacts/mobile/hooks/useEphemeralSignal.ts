import { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { EphemeralRequestGate } from "@/lib/ephemeralRequestGate";
import { noteChatPending } from "@/lib/chatPerformanceDiagnostics";

function canSendEphemeralSignal(): boolean {
  if (Platform.OS !== "web" || typeof document === "undefined") return true;
  if (document.visibilityState !== "visible") return false;
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function useEphemeralSignal(
  operation: (signal: AbortSignal) => Promise<unknown>,
  options: {
    minIntervalMs: number;
    timeoutMs: number;
    operationKey?: string;
    diagnosticName?: "typing" | "presence";
  },
): () => void {
  const operationRef = useRef(operation);
  operationRef.current = operation;
  const gate = useMemo(
    () =>
      new EphemeralRequestGate({
        minIntervalMs: options.minIntervalMs,
        timeoutMs: options.timeoutMs,
        onPendingChange: options.diagnosticName
          ? (pending) => noteChatPending(options.diagnosticName!, pending ? 1 : -1)
          : undefined,
      }),
    [
      options.diagnosticName,
      options.minIntervalMs,
      options.operationKey,
      options.timeoutMs,
    ],
  );

  useEffect(() => () => gate.dispose(), [gate]);

  return useCallback(() => {
    if (!canSendEphemeralSignal()) return;
    gate.tryRun((signal) => operationRef.current(signal));
  }, [gate]);
}
