import { NativeModules, Platform } from "react-native";
import type { CallMedia } from "@/lib/voiceCall";

type CallForegroundModule = {
  start: (media: CallMedia) => Promise<void>;
  stop: () => Promise<void>;
};

function getCallForegroundService(): CallForegroundModule | undefined {
  return NativeModules.CallForegroundService as CallForegroundModule | undefined;
}

export function isCallForegroundServiceAvailable(): boolean {
  return Platform.OS !== "android" || Boolean(getCallForegroundService()?.start);
}

export async function startCallForegroundService(media: CallMedia): Promise<void> {
  if (Platform.OS !== "android") return;
  const callForegroundService = getCallForegroundService();
  if (!callForegroundService?.start) {
    throw new Error("call_foreground_service_unavailable");
  }
  await callForegroundService.start(media);
}

export async function stopCallForegroundService(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const callForegroundService = getCallForegroundService();
    await callForegroundService?.stop();
  } catch {}
}
