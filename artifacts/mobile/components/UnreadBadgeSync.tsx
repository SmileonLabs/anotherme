import React from "react";
import { Platform } from "react-native";
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";

type BadgingNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export function UnreadBadgeSync() {
  const { count } = useUnreadMessageCount();

  React.useEffect(() => {
    if (Platform.OS !== "web" || typeof navigator === "undefined") return;
    const nav = navigator as BadgingNavigator;
    if (!nav.setAppBadge || !nav.clearAppBadge) return;
    if (count > 0) {
      void nav.setAppBadge(count).catch(() => {});
    } else {
      void nav.clearAppBadge().catch(() => {});
    }
  }, [count]);

  return null;
}
