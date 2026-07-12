// Web no-op stub. Native push (FCM on Android / APNs on iOS) is a native-build
// feature; the web/PWA build uses webPush.ts instead. Metro picks this file on
// web; nativePush.ts is used on native.

import type { IncomingCallIntent } from "@/lib/callNotifications";

export const nativePushSupported = false;
export const GENERAL_NOTIFICATION_CHANNEL_ID = "general-notifications";

export type NativePushState = {
  supported: boolean;
  permission: "default" | "granted" | "denied";
  tokenAvailable: boolean;
};

export function setupNotificationHandler(): void {}

export async function registerForPushTokenAsync(): Promise<string | null> {
  return null;
}

export async function getNativePushState(): Promise<NativePushState> {
  return { supported: false, permission: "default", tokenAvailable: false };
}

export function subscribeForegroundIncomingCall(
  _handler: (intent: IncomingCallIntent) => void,
): () => void {
  return () => {};
}

export function subscribePushTokenRefresh(
  _handler: (token: string) => void,
): () => void {
  return () => {};
}

export function subscribeNotificationOpen(
  _handler: (url: string) => void,
): () => void {
  return () => {};
}

export async function getInitialNotificationUrl(): Promise<string | null> {
  return null;
}
