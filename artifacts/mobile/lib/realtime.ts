import { useEffect } from "react";
import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import {
  getFetchRoomMessagesQueryKey,
  getGetCallQueryKey,
  getGetRoomQueryKey,
  getGetTypingUsersQueryKey,
  getListIncomingCallsQueryKey,
  getListRoomsQueryKey,
} from "@workspace/api-client-react";
import { getApiBase } from "@/lib/apiBase";

type RealtimeEventType =
  | "message.created"
  | "message.updated"
  | "message.read"
  | "typing.updated"
  | "room.updated"
  | "call.created"
  | "call.updated";

interface RealtimeEvent {
  type: RealtimeEventType;
  userIds: string[];
  roomId?: string | null;
  callId?: string | null;
  actorUserId?: string | null;
  data?: Record<string, unknown>;
  createdAt: string;
}

const EVENT_TYPES = new Set<RealtimeEventType>([
  "message.created",
  "message.updated",
  "message.read",
  "typing.updated",
  "room.updated",
  "call.created",
  "call.updated",
]);

function getRealtimeUrl(ticket: string): string | null {
  const apiBase = getApiBase();
  const origin =
    apiBase ||
    (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "");
  if (!origin) return null;

  const url = new URL("/api/realtime", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("ticket", ticket);
  return url.toString();
}

async function getRealtimeTicket(token: string): Promise<string | null> {
  try {
    const response = await fetch(`${getApiBase()}/api/realtime/ticket`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { ticket?: unknown };
    return typeof payload.ticket === "string" ? payload.ticket : null;
  } catch {
    return null;
  }
}

function parseRealtimeEvent(raw: unknown): RealtimeEvent | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RealtimeEvent>;
    if (!parsed.type || !EVENT_TYPES.has(parsed.type)) return null;
    return parsed as RealtimeEvent;
  } catch {
    return null;
  }
}

export function useRealtimeInvalidation(): void {
  const { isSignedIn, getToken } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSignedIn || typeof WebSocket === "undefined") return;

    let closed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempt = 0;

    const invalidateRoomMessages = (roomId: string) => {
      void queryClient.invalidateQueries({ queryKey: getFetchRoomMessagesQueryKey(roomId) });
    };

    const invalidateRoomMeta = (roomId: string) => {
      void queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) });
      void queryClient.invalidateQueries({ queryKey: getListRoomsQueryKey() });
    };

    const handleEvent = (event: RealtimeEvent) => {
      if (event.roomId) {
        if (
          event.type === "message.created" ||
          event.type === "message.updated"
        ) {
          invalidateRoomMessages(event.roomId);
          invalidateRoomMeta(event.roomId);
        }
        if (event.type === "message.read") {
          invalidateRoomMessages(event.roomId);
        }
        if (
          event.type === "room.updated" ||
          event.type === "call.created" ||
          event.type === "call.updated"
        ) {
          invalidateRoomMeta(event.roomId);
        }
        if (event.type === "typing.updated") {
          void queryClient.invalidateQueries({ queryKey: getGetTypingUsersQueryKey(event.roomId) });
        }
      }

      if (event.type === "call.created" || event.type === "call.updated") {
        void queryClient.invalidateQueries({ queryKey: getListIncomingCallsQueryKey() });
        if (event.callId) {
          void queryClient.invalidateQueries({ queryKey: getGetCallQueryKey(event.callId) });
        }
      }
    };

    const scheduleReconnect = () => {
      if (closed || retryTimer) return;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(retryAttempt, 5));
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect();
      }, delay);
    };

    const connect = async () => {
      try {
        const token = await getToken();
        if (closed) return;
        if (!token) {
          scheduleReconnect();
          return;
        }

        const ticket = await getRealtimeTicket(token);
        if (closed || !ticket) {
          scheduleReconnect();
          return;
        }
        const url = getRealtimeUrl(ticket);
        if (!url) return;

        socket = new WebSocket(url);
        socket.onopen = () => {
          retryAttempt = 0;
        };
        socket.onmessage = (message) => {
          const event = parseRealtimeEvent(message.data);
          if (event) handleEvent(event);
        };
        socket.onclose = () => {
          socket = null;
          scheduleReconnect();
        };
        socket.onerror = () => {
          socket?.close();
        };
      } catch {
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [isSignedIn, getToken, queryClient]);
}
