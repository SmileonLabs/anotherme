// Native push (FCM on Android via google-services.json / APNs on iOS) using
// expo-notifications. Metro picks nativePush.web.ts on web.
//
// The API server sends native FCM messages via firebase-admin (lib/fcm.ts):
// registerForPushTokenAsync() registers the raw device token through
// POST /users/me/push-token, where the server routes it to native FCM storage.
// The foreground listener below handles incoming-call data messages while the
// app is open. Full-screen-over-lockscreen while the app is killed still needs a
// native FCM background handler (see replit.md "Remaining native gap").

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
