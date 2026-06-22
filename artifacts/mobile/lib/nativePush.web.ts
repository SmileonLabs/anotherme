// Web no-op stub. Native push (FCM on Android / APNs on iOS) is a native-build
// feature; the web/PWA build uses webPush.ts instead. Metro picks this file on
// web; nativePush.ts is used on native.

import type { IncomingCallIntent } from "@/lib/callNotifications";

export const nativePushSupported = false;

export function setupNotificationHandler(): void {}

export async function registerForPushTokenAsync(): Promise<string | null> {
  return null;
}

export function subscribeForegroundIncomingCall(
  _handler: (intent: IncomingCallIntent) => void,
): () => void {
  return () => {};
}
