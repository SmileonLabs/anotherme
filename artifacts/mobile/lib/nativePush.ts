// Native push (FCM on Android via google-services.json / APNs on iOS) using
// expo-notifications. Metro picks nativePush.web.ts on web.
//
// NOTE: the API server currently only sends Web Push (VAPID). Actually waking a
// backgrounded native device requires the server to send an FCM data message via
// firebase-admin — see replit.md "Native push (FCM)". Until then this registers
// the device token (harmless; the server ignores non-web-push tokens) and the
// foreground listener below handles data messages once that server path exists.

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { IncomingCallIntent } from "@/lib/callNotifications";

export const nativePushSupported = Platform.OS !== "web";

export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function registerForPushTokenAsync(): Promise<string | null> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    let status = perm.status;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return null;
    // Device push token: FCM registration token on Android, APNs token on iOS.
    const token = await Notifications.getDevicePushTokenAsync();
    return typeof token.data === "string" ? token.data : JSON.stringify(token.data);
  } catch {
    return null;
  }
}

function intentFromContent(
  content: Notifications.NotificationContent,
): IncomingCallIntent | null {
  const data = content.data as Record<string, unknown> | undefined;
  if (!data || data.type !== "incoming_call") return null;
  const callId = typeof data.callId === "string" ? data.callId : null;
  if (!callId) return null;
  return {
    callId,
    callerName: content.title ? content.title : "수신 전화",
    chatRoomId: typeof data.chatRoomId === "string" ? data.chatRoomId : null,
  };
}

export function subscribeForegroundIncomingCall(
  handler: (intent: IncomingCallIntent) => void,
): () => void {
  const sub = Notifications.addNotificationReceivedListener((n) => {
    const intent = intentFromContent(n.request.content);
    if (intent) handler(intent);
  });
  return () => sub.remove();
}
