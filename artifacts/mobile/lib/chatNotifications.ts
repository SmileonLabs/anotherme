import notifee from "@notifee/react-native";

type DisplayedNotificationLike = {
  id?: string;
  notification?: {
    id?: string;
    data?: Record<string, unknown>;
    android?: {
      tag?: string;
      channelId?: string;
    };
  };
};

type NotifeeDisplayedApi = typeof notifee & {
  getDisplayedNotifications?: () => Promise<DisplayedNotificationLike[]>;
  cancelDisplayedNotification?: (id: string, tag?: string) => Promise<void>;
};

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function roomTag(roomId: string): string {
  return `room-${roomId}`;
}

function notificationData(displayed: DisplayedNotificationLike): Record<string, unknown> {
  return displayed.notification?.data ?? {};
}

function notificationTag(displayed: DisplayedNotificationLike): string | null {
  return asString(displayed.notification?.android?.tag) ?? asString(notificationData(displayed).tag);
}

function matchesRoom(displayed: DisplayedNotificationLike, roomId: string): boolean {
  const data = notificationData(displayed);
  const expectedTag = roomTag(roomId);
  const url = asString(data.url);
  return (
    notificationTag(displayed) === expectedTag ||
    asString(data.roomId) === roomId ||
    asString(data.chatRoomId) === roomId ||
    url === `/chat/${roomId}`
  );
}

function matchesAnyChat(displayed: DisplayedNotificationLike): boolean {
  const data = notificationData(displayed);
  const tag = notificationTag(displayed);
  const url = asString(data.url);
  return !!tag?.startsWith("room-") || !!url?.startsWith("/chat/");
}

async function cancelDisplayedNotification(displayed: DisplayedNotificationLike): Promise<void> {
  const api = notifee as NotifeeDisplayedApi;
  const id = asString(displayed.id) ?? asString(displayed.notification?.id);
  if (!id) return;
  const tag = notificationTag(displayed) ?? undefined;
  if (api.cancelDisplayedNotification) {
    await api.cancelDisplayedNotification(id, tag);
    return;
  }
  await notifee.cancelNotification(id);
}

export async function clearChatNotifications(roomId?: string | null): Promise<void> {
  try {
    const api = notifee as NotifeeDisplayedApi;
    const displayed = await api.getDisplayedNotifications?.();
    if (!Array.isArray(displayed)) return;
    const matches = displayed.filter((item) => (roomId ? matchesRoom(item, roomId) : matchesAnyChat(item)));
    await Promise.all(matches.map(cancelDisplayedNotification));
  } catch {
    // Best-effort: stale OS notifications should never break app UX.
  }
}
