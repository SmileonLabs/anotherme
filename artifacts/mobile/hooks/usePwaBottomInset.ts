import { useEffect, useState } from "react";
import { Platform } from "react-native";

/**
 * Bottom safe-area inset for the installed web PWA (iOS home indicator).
 *
 * On web, `react-native-safe-area-context` only reports a non-zero
 * `insets.bottom` when the page sets `viewport-fit=cover`. We intentionally do
 * NOT set cover (it pushes content under the status bar/notch on this
 * react-native-web setup and breaks the top of every screen). The downside is
 * that web `insets.bottom` is always 0, so bottom-anchored UI (the tab bar, the
 * message composer) renders under the iOS home indicator once the app is
 * installed to the home screen (standalone display mode) and gets clipped.
 *
 * This hook returns a fixed 34px (the iOS portrait home-indicator height) ONLY
 * for an installed PWA, and 0 everywhere else (native apps, regular browser
 * tabs, desktop). Native builds always get 0 here because they read the real
 * inset via `useSafeAreaInsets()`.
 */
export function usePwaBottomInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const nav = window.navigator as unknown as {
      standalone?: boolean;
      userAgent: string;
      platform?: string;
      maxTouchPoints?: number;
    };
    // iOS only — the home indicator (and this clipping) is an iOS concept.
    // Modern iPadOS reports as "MacIntel" but is touch-capable, so include that.
    const isIOS =
      /iPad|iPhone|iPod/.test(nav.userAgent) ||
      (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1);

    const mq = window.matchMedia("(display-mode: standalone)");
    const compute = () => {
      const standalone = mq.matches || nav.standalone === true;
      setInset(isIOS && standalone ? 34 : 0);
    };

    compute();
    mq.addEventListener?.("change", compute);
    return () => mq.removeEventListener?.("change", compute);
  }, []);

  return inset;
}
