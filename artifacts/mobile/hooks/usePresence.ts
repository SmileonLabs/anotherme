import { useEffect, useMemo, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "@clerk/expo";
import { usePathname } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

const HEARTBEAT_INTERVAL_MS = 25_000;

export interface PresenceState {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
  platform: string | null;
  roomId: string | null;
}

interface PresenceResponse {
  users: PresenceState[];
}

function getRoomIdFromPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/chat\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getPlatformLabel(): string {
  if (Platform.OS !== "web") return Platform.OS;
  if (typeof window === "undefined") return "web";
  const nav = window.navigator as unknown as { standalone?: boolean };
  const standalone = nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return standalone ? "pwa" : "web";
}

async function sendPresenceHeartbeat(roomId: string | null): Promise<void> {
  await customFetch("/api/presence/heartbeat", {
    method: "POST",
    body: JSON.stringify({ roomId, platform: getPlatformLabel() }),
  });
}

export function usePresenceHeartbeat(): void {
  const { isSignedIn } = useAuth();
  const pathname = usePathname();
  const roomIdRef = useRef<string | null>(null);
  roomIdRef.current = getRoomIdFromPath(pathname);

  useEffect(() => {
    if (!isSignedIn) return;

    let stopped = false;
    const beat = () => {
      if (stopped) return;
      void sendPresenceHeartbeat(roomIdRef.current).catch(() => {});
    };

    beat();
    const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);

    if (Platform.OS === "web" && typeof document !== "undefined") {
      const onVisible = () => {
        if (document.visibilityState === "visible") beat();
      };
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("pageshow", beat);
      return () => {
        stopped = true;
        clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("pageshow", beat);
      };
    }

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") beat();
    });
    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [isSignedIn]);
}

export const presenceUsersQueryKey = (userIds: string[]) => ["presence", "users", [...userIds].sort().join(",")] as const;

export function usePresenceUsers(userIds: Array<string | null | undefined>) {
  const ids = useMemo(() => Array.from(new Set(userIds.filter((id): id is string => !!id))), [userIds]);
  return useQuery({
    queryKey: presenceUsersQueryKey(ids),
    enabled: ids.length > 0,
    refetchInterval: 15_000,
    queryFn: () =>
      customFetch<PresenceResponse>(`/api/presence/users?ids=${encodeURIComponent(ids.join(","))}`, {
        responseType: "json",
      }),
  });
}
