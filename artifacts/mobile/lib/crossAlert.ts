import { Alert, Platform, type AlertButton } from "react-native";

/**
 * Cross-platform replacement for Alert.alert.
 *
 * react-native-web does NOT implement Alert.alert — it is a silent no-op. That
 * means on the web/PWA build every confirmation dialog never appears and its
 * button `onPress` callbacks never run (e.g. logout, leave room, unblock). This
 * mirrors the Alert.alert signature but falls back to window.confirm /
 * window.alert on web so both the dialog and its callbacks work.
 */
export function crossAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
): void {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = [title, message].filter(Boolean).join("\n\n");
  const hasWindow = typeof window !== "undefined";
  const primary = (buttons ?? []).find((b) => b.style !== "cancel");
  const cancel = (buttons ?? []).find((b) => b.style === "cancel");

  // No buttons or a single button → informational alert, then run its action.
  if (!buttons || buttons.length <= 1) {
    if (hasWindow) window.alert(text);
    primary?.onPress?.();
    return;
  }

  // Multiple buttons → confirm dialog; run primary on confirm, cancel otherwise.
  const confirmed = hasWindow ? window.confirm(text) : false;
  if (confirmed) primary?.onPress?.();
  else cancel?.onPress?.();
}
