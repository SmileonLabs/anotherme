import React from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "@clerk/expo";
import { getListRoomsQueryKey, useListRooms } from "@workspace/api-client-react";
import { clearChatNotifications } from "@/lib/chatNotifications";

export function useUnreadMessageCount(): { count: number; refetch: () => void } {
  const { isSignedIn } = useAuth();
  const { data: rooms = [], refetch, isSuccess } = useListRooms({
    query: { enabled: !!isSignedIn, queryKey: getListRoomsQueryKey() },
  });

  React.useEffect(() => {
    if (!isSignedIn) return;
    const refresh = () => {
      void refetch();
    };
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof document !== "undefined") {
      const onFocus = () => refresh();
      const onVisibility = () => {
        if (document.visibilityState === "visible") refresh();
      };
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        appStateSub.remove();
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }
    return () => appStateSub.remove();
  }, [isSignedIn, refetch]);

  const count = React.useMemo(
    () =>
      isSignedIn
        ? rooms.reduce((sum, room) => sum + Math.max(0, room.unreadCount ?? 0), 0)
        : 0,
    [isSignedIn, rooms],
  );

  React.useEffect(() => {
    if (!isSignedIn || !isSuccess || count !== 0) return;
    void clearChatNotifications();
  }, [count, isSignedIn, isSuccess]);

  return { count, refetch: () => void refetch() };
}
