// Native push via @react-native-firebase/messaging (Android FCM). Device-token
// registration + FOREGROUND message handling live here; the killed/background
// handler is registered at the app entry (index.js → lib/fcmBackground.ts).
// notifee renders the actual full-screen incoming-call UI (callNotifications.ts).
// Metro picks nativePush.web.ts on web.

import messaging from "@react-native-firebase/messaging";
import { Platform } from "react-native";
import type { IncomingCallIntent } from "@/lib/callNotifications";

export const nativePushSupported = Platform.OS !== "web";

// notifee owns notification permission + channel/display; nothing to configure
// for RN-firebase here. Kept for API parity with the web stub / caller.
export function setupNotificationHandler(): void {}

export async function registerForPushTokenAsync(): Promise<string | null> {
  try {
    const status = await messaging().requestPermission();
    const granted =
      status === messaging.AuthorizationStatus.AUTHORIZED ||
      status === messaging.AuthorizationStatus.PROVISIONAL;
    if (!granted) return null;
    if (Platform.OS === "ios") {
      await messaging().registerDeviceForRemoteMessages();
    }
    const token = await messaging().getToken();
    return token || null;
  } catch {
    return null;
  }
}

function intentFromData(
  data: Record<string, string | object> | undefined,
): IncomingCallIntent | null {
  if (!data) return null;
  if (data.type !== "incoming_call") return null;
  const callId = typeof data.callId === "string" ? data.callId : null;
  if (!callId) return null;
  return {
    callId,
    callerName: typeof data.callerName === "string" ? data.callerName : "수신 전화",
    chatRoomId:
      typeof data.chatRoomId === "string" && data.chatRoomId ? data.chatRoomId : null,
  };
}

// Foreground-only: messages that arrive while the app is open. Killed/background
// delivery is handled by lib/fcmBackground.ts.
export function subscribeForegroundIncomingCall(
  handler: (intent: IncomingCallIntent) => void,
): () => void {
  return messaging().onMessage(async (remoteMessage) => {
    const intent = intentFromData(remoteMessage.data);
    if (intent) handler(intent);
  });
}
