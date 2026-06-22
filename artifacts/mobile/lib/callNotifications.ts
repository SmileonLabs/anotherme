// Native full-screen incoming-call notifications via notifee. On Android a
// high-importance notification with a fullScreenAction launches the app over the
// lock screen ("전화가 오는 것처럼"); on iOS it shows a heads-up banner (a true
// CallKit experience needs PushKit/CallKit + an Apple Developer account — see
// replit.md). Metro picks callNotifications.web.ts on web.

import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  EventType,
  type Event,
} from "@notifee/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface IncomingCallIntent {
  callId: string;
  callerName: string;
  chatRoomId: string | null;
}

export interface PendingCallAction {
  action: "accept" | "decline";
  intent: IncomingCallIntent;
}

export const callNotificationsSupported = true;

const CHANNEL_ID = "incoming-calls";
const NOTIFICATION_ID = "incoming-call";
const PENDING_KEY = "pendingCallAction";

// An accept/decline tapped while the app was killed/backgrounded is handled by
// notifee.onBackgroundEvent, which runs in a SEPARATE headless JS context with
// no access to React navigation — and, crucially, no shared module state with
// the main app process. So the action must be persisted durably (AsyncStorage),
// not in a module-level variable, for the app to consume it on cold start.
async function stashPendingCallAction(action: PendingCallAction): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(action));
  } catch {}
}

function intentFromData(data: Record<string, unknown> | undefined): IncomingCallIntent | null {
  if (!data) return null;
  const callId = typeof data.callId === "string" ? data.callId : null;
  if (!callId) return null;
  return {
    callId,
    callerName: typeof data.callerName === "string" ? data.callerName : "수신 전화",
    chatRoomId: typeof data.chatRoomId === "string" ? data.chatRoomId : null,
  };
}

function handleEvent(
  event: Event,
  handlers?: {
    onAccept: (intent: IncomingCallIntent) => void;
    onDecline: (intent: IncomingCallIntent) => void;
  },
): void {
  const { type, detail } = event;
  if (type !== EventType.PRESS && type !== EventType.ACTION_PRESS) return;
  const intent = intentFromData(
    detail.notification?.data as Record<string, unknown> | undefined,
  );
  if (!intent) return;
  const actionId = detail.pressAction?.id ?? "default";
  const action: "accept" | "decline" = actionId === "decline" ? "decline" : "accept";
  void notifee.cancelNotification(NOTIFICATION_ID);
  if (handlers) {
    if (action === "decline") handlers.onDecline(intent);
    else handlers.onAccept(intent);
  } else {
    void stashPendingCallAction({ action, intent });
  }
}

// Background/quit-state taps. Must be registered exactly once at module load,
// before React renders — this runs in a headless JS context with no navigation.
notifee.onBackgroundEvent(async (event) => {
  handleEvent(event);
});

export async function setupCallNotifications(): Promise<void> {
  try {
    await notifee.requestPermission();
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: "수신 전화",
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound: "default",
      vibration: true,
    });
  } catch {}
}

export async function displayIncomingCallNotification(
  intent: IncomingCallIntent,
): Promise<void> {
  try {
    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title: intent.callerName,
      body: "수신 전화…",
      data: {
        callId: intent.callId,
        callerName: intent.callerName,
        chatRoomId: intent.chatRoomId ?? "",
      },
      android: {
        channelId: CHANNEL_ID,
        category: AndroidCategory.CALL,
        importance: AndroidImportance.HIGH,
        // Launch the app full-screen over the lock screen.
        fullScreenAction: { id: "default" },
        pressAction: { id: "default" },
        actions: [
          { title: "거절", pressAction: { id: "decline" } },
          { title: "수락", pressAction: { id: "accept" } },
        ],
        // Keep it sticky so it behaves like a ringing call, not a dismissible
        // banner. CallProvider/cancel clears it.
        ongoing: true,
        autoCancel: false,
        loopSound: true,
      },
      ios: {
        critical: true,
        sound: "default",
        interruptionLevel: "timeSensitive",
      },
    });
  } catch {}
}

export async function cancelIncomingCallNotification(): Promise<void> {
  try {
    await notifee.cancelNotification(NOTIFICATION_ID);
  } catch {}
}

export function subscribeCallActions(handlers: {
  onAccept: (intent: IncomingCallIntent) => void;
  onDecline: (intent: IncomingCallIntent) => void;
}): () => void {
  return notifee.onForegroundEvent((event) => handleEvent(event, handlers));
}

export async function consumePendingCallIntent(): Promise<PendingCallAction | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(PENDING_KEY);
    const parsed = JSON.parse(raw) as PendingCallAction;
    if (parsed?.intent?.callId && (parsed.action === "accept" || parsed.action === "decline")) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
