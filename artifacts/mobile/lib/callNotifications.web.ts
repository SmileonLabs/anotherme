// Web no-op stub. Full-screen incoming-call notifications are an Android/iOS
// native feature (notifee); the web/PWA build shows the in-app CallProvider modal
// instead. Metro picks this file on web; callNotifications.ts is used on native.

export interface IncomingCallIntent {
  callId: string;
  callerName: string;
  chatRoomId: string | null;
}

export interface PendingCallAction {
  action: "accept" | "decline";
  intent: IncomingCallIntent;
}

export const callNotificationsSupported = false;

export async function setupCallNotifications(): Promise<void> {}

export async function displayIncomingCallNotification(
  _intent: IncomingCallIntent,
): Promise<void> {}

export async function cancelIncomingCallNotification(): Promise<void> {}

export function subscribeCallActions(_handlers: {
  onAccept: (intent: IncomingCallIntent) => void;
  onDecline: (intent: IncomingCallIntent) => void;
}): () => void {
  return () => {};
}

export async function consumePendingCallIntent(): Promise<PendingCallAction | null> {
  return null;
}
