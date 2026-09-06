import { getApiBase } from "@/lib/apiBase";

const PUSH_REVOKE_TIMEOUT_MS = 6_000;

/**
 * Best-effort logout/account-switch cleanup. The bearer is captured while the
 * old owner is still signed in; using the current global auth getter here could
 * accidentally revoke the new owner's binding after a rapid account switch.
 */
export async function revokePushRegistrationWithBearer(
  rawToken: string | null | undefined,
  bearer: string | null | undefined,
): Promise<boolean> {
  if (!rawToken || rawToken.length > 8_192 || !bearer) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUSH_REVOKE_TIMEOUT_MS);
  try {
    const response = await fetch(`${getApiBase()}/api/users/me/push-token`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: rawToken }),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
