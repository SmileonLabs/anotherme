import { useEffect, useRef } from "react";
import { Animated, Platform } from "react-native";

/**
 * Returns an animated transform style that plays a quick left/right "shake"
 * each time `trigger` changes to a new non-null value. Used to add combat
 * impact feel (a struck bubble or enemy card jolts).
 */
export function useShakeStyle(trigger: number | string | null | undefined) {
  const tx = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  useEffect(() => {
    // Skip the initial mount so existing content doesn't shake on first render.
    if (first.current) {
      first.current = false;
      return;
    }
    if (trigger === null || trigger === undefined) return;

    const useNative = Platform.OS !== "web";
    tx.setValue(0);
    Animated.sequence([
      Animated.timing(tx, { toValue: -8, duration: 45, useNativeDriver: useNative }),
      Animated.timing(tx, { toValue: 8, duration: 45, useNativeDriver: useNative }),
      Animated.timing(tx, { toValue: -6, duration: 45, useNativeDriver: useNative }),
      Animated.timing(tx, { toValue: 6, duration: 45, useNativeDriver: useNative }),
      Animated.timing(tx, { toValue: -3, duration: 45, useNativeDriver: useNative }),
      Animated.timing(tx, { toValue: 0, duration: 45, useNativeDriver: useNative }),
    ]).start();
  }, [trigger, tx]);

  return { transform: [{ translateX: tx }] };
}
