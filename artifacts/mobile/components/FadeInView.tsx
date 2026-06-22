import React, { useEffect, useRef } from "react";
import { Animated, Platform, type ViewStyle } from "react-native";

interface FadeInViewProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** When false, render instantly without animating (e.g. message history). */
  animate?: boolean;
  duration?: number;
  /** Delay before the entrance starts — used to stagger sibling items. */
  delay?: number;
}

/**
 * Fades + slides its children in on mount. Used to make a dungeon turn's
 * messages "land" one by one as they are revealed, instead of popping in all at
 * once. Pass animate={false} to skip the effect for already-seen history.
 */
export function FadeInView({ children, style, animate = true, duration = 260, delay = 0 }: FadeInViewProps) {
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) return;
    const useNative = Platform.OS !== "web";
    Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      useNativeDriver: useNative,
    }).start();
  }, [animate, duration, delay, progress]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
