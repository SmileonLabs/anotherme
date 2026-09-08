import { useEffect } from "react";
import { Platform } from "react-native";
import { noteChatResource } from "@/lib/chatPerformanceDiagnostics";

type Refetch = () => unknown;

function canPollNow(): boolean {
  if (Platform.OS !== "web" || typeof document === "undefined") return true;
  return document.visibilityState === "visible" && navigator.onLine !== false;
}

export function useChatPolling({
  isDungeon,
  dungeonThinking,
  refetchMessages,
  refetchTyping,
  refetchDungeon,
}: {
  isDungeon: boolean;
  dungeonThinking: boolean;
  refetchMessages: Refetch;
  refetchTyping: Refetch;
  refetchDungeon: Refetch;
}) {
  useEffect(() => {
    // Realtime invalidates immediately; this catches reconnect gaps and older
    // deployments where a socket event is missed.
    const timer = setInterval(() => {
      if (canPollNow()) void refetchMessages();
    }, 30_000);
    noteChatResource("timers", 1);
    return () => {
      clearInterval(timer);
      noteChatResource("timers", -1);
    };
  }, [refetchMessages]);

  useEffect(() => {
    // Typing uses a server TTL, so polling clears stale indicators promptly.
    const timer = setInterval(() => {
      if (canPollNow()) void refetchTyping();
    }, 5_000);
    noteChatResource("timers", 1);
    return () => {
      clearInterval(timer);
      noteChatResource("timers", -1);
    };
  }, [refetchTyping]);

  useEffect(() => {
    if (!isDungeon || !dungeonThinking) return;
    const timer = setInterval(() => {
      if (!canPollNow()) return;
      void refetchMessages();
      void refetchDungeon();
    }, 1_200);
    noteChatResource("timers", 1);
    return () => {
      clearInterval(timer);
      noteChatResource("timers", -1);
    };
  }, [dungeonThinking, isDungeon, refetchDungeon, refetchMessages]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const catchUp = () => {
      if (!canPollNow()) return;
      void refetchMessages();
      void refetchTyping();
      if (isDungeon) void refetchDungeon();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") catchUp();
    };
    window.addEventListener("online", catchUp);
    window.addEventListener("pageshow", catchUp);
    document.addEventListener("visibilitychange", onVisibilityChange);
    noteChatResource("listeners", 3);
    return () => {
      window.removeEventListener("online", catchUp);
      window.removeEventListener("pageshow", catchUp);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      noteChatResource("listeners", -3);
    };
  }, [isDungeon, refetchDungeon, refetchMessages, refetchTyping]);
}
