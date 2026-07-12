import { useEffect } from "react";

type Refetch = () => unknown;

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
    const timer = setInterval(() => refetchMessages(), 30_000);
    return () => clearInterval(timer);
  }, [refetchMessages]);

  useEffect(() => {
    // Typing uses a server TTL, so polling clears stale indicators promptly.
    const timer = setInterval(() => refetchTyping(), 5_000);
    return () => clearInterval(timer);
  }, [refetchTyping]);

  useEffect(() => {
    if (!isDungeon || !dungeonThinking) return;
    const timer = setInterval(() => {
      void refetchMessages();
      void refetchDungeon();
    }, 1_200);
    return () => clearInterval(timer);
  }, [dungeonThinking, isDungeon, refetchDungeon, refetchMessages]);
}
