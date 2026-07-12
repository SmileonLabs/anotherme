import { NativeModules, Platform } from "react-native";
import type { CallMedia } from "@/lib/voiceCall";

type CallForegroundModule = {
  start: (media: CallMedia) => Promise<void>;
  stop: () => Promise<void>;
};

const callForegroundService = NativeModules.CallForegroundService as
  | CallForegroundModule
  | undefined;

export async function startCallForegroundService(media: CallMedia): Promise<void> {
  if (Platform.OS !== "android") return;
  if (!callForegroundService?.start) {
    throw new Error("call_foreground_service_unavailable");
  }
  await callForegroundService.start(media);
}

export async function stopCallForegroundService(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await callForegroundService?.stop();
  } catch {}
}
