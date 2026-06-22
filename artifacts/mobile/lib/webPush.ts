// Native fallback. Web push is only supported on the web/PWA build.
// Metro picks webPush.web.ts on web; this file is used on native.

export type WebPushResult = "granted" | "denied" | "unsupported";

export type WebPushState = {
  supported: boolean;
  permission: "default" | "granted" | "denied";
  subscribed: boolean;
};

export const webPushSupported = false;

export async function getWebPushState(): Promise<WebPushState> {
  return { supported: false, permission: "default", subscribed: false };
}

export async function subscribeWebPush(
  _register: (token: string) => Promise<unknown>,
): Promise<WebPushResult> {
  return "unsupported";
}

export async function ensureWebPushIfGranted(
  _register: (token: string) => Promise<unknown>,
): Promise<void> {}
