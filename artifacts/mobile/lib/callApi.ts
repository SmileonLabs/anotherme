import { customFetch, type Call } from "@workspace/api-client-react";

export async function markCallFailed(callId: string): Promise<Call | null> {
  try {
    return await customFetch<Call>(`/api/calls/${callId}/failed`, {
      method: "POST",
      responseType: "json",
    });
  } catch {
    return null;
  }
}

export function reportCallDiagnostic(
  callId: string | null | undefined,
  payload: {
    phase: string;
    platform: string;
    role?: string;
    details?: Record<string, unknown>;
  },
): void {
  if (!callId) return;
  void customFetch(`/api/calls/${callId}/diagnostics`, {
    method: "POST",
    responseType: "text",
    body: JSON.stringify(payload),
  }).catch(() => {});
}
