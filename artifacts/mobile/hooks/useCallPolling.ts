import { useEffect } from "react";
import { useGetCall, useListIncomingCalls } from "@workspace/api-client-react";
import { callPollingInterval, watchedCallId, type CallMode } from "@/lib/callLifecycle";

export function useCallPolling(args: {
  mode: CallMode;
  activeCallId?: string | null;
  incomingCallId?: string | null;
}) {
  const incomingQuery = useListIncomingCalls();
  useEffect(() => {
    const timer = setInterval(() => incomingQuery.refetch(), 30_000);
    return () => clearInterval(timer);
  }, [incomingQuery.refetch]);

  const watchId = watchedCallId(args);
  const watchPollMs = callPollingInterval(args.mode);
  const watchedQuery = useGetCall(watchId);
  useEffect(() => {
    if (!watchId) return;
    const timer = setInterval(() => watchedQuery.refetch(), watchPollMs);
    return () => clearInterval(timer);
  }, [watchId, watchPollMs, watchedQuery.refetch]);

  return {
    incomingList: incomingQuery.data,
    refetchIncoming: incomingQuery.refetch,
    watched: watchedQuery.data,
    refetchWatched: watchedQuery.refetch,
    watchId,
  };
}
