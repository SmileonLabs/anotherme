// Web push engine — real implementation used on the web/PWA build.

export type WebPushResult = "granted" | "denied" | "unsupported";

export type WebPushState = {
  supported: boolean;
  permission: "default" | "granted" | "denied";
  subscribed: boolean;
};

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || "";

export const webPushSupported =
  typeof window !== "undefined" &&
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getOrCreateSubscription(): Promise<PushSubscription | null> {
  if (!webPushSupported || !VAPID_PUBLIC_KEY) return null;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  });
}

/**
 * Prompts for notification permission (user-gesture driven), subscribes to web
 * push, and registers the subscription with the server.
 */
export async function subscribeWebPush(
  register: (token: string) => Promise<unknown>,
): Promise<WebPushResult> {
  if (!webPushSupported || !VAPID_PUBLIC_KEY) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const sub = await getOrCreateSubscription();
  if (!sub) return "unsupported";
  await register(JSON.stringify(sub));
  return "granted";
}

/**
 * Reports the real push state on this device: whether the browser supports push,
 * the current notification permission, and whether an active subscription exists.
 * Used by the settings UI so the toggle reflects reality, not just the stored flag.
 */
export async function getWebPushState(): Promise<WebPushState> {
  if (!webPushSupported) {
    return { supported: false, permission: "default", subscribed: false };
  }
  const permission = Notification.permission as WebPushState["permission"];
  let subscribed = false;
  if (permission === "granted") {
    try {
      const reg = await navigator.serviceWorker.ready;
      subscribed = (await reg.pushManager.getSubscription()) !== null;
    } catch {
      subscribed = false;
    }
  }
  return { supported: true, permission, subscribed };
}

/**
 * Silently re-subscribes and registers only if permission was already granted.
 * Safe to call on app load — never prompts the user.
 */
export async function ensureWebPushIfGranted(
  register: (token: string) => Promise<unknown>,
): Promise<void> {
  if (!webPushSupported || !VAPID_PUBLIC_KEY) return;
  if (Notification.permission !== "granted") return;
  try {
    const sub = await getOrCreateSubscription();
    if (sub) await register(JSON.stringify(sub));
  } catch {
    // best-effort — ignore failures during silent re-subscribe
  }
}
