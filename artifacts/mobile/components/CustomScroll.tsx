import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  FlatListProps,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  ScrollViewProps,
  SectionList,
  SectionListProps,
  StyleSheet,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

// Shared custom scroll indicator used across every screen. Hides the native
// scrollbar and draws a slim thumb that appears instantly while scrolling and
// fades out shortly after the user stops. Web/PWA is the primary target and
// react-native-web's ScrollView only emits onScroll (no drag/momentum events),
// so an idle timer after the last scroll frame is the only cross-platform way to
// detect "scrolling stopped". Geometry is set directly on Animated values (no
// re-render per frame); only the opacity is animated.
const PAD = 4;
const MIN_THUMB = 36;

function useScrollbar() {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0)).current;
  const thumbHeight = useRef(new Animated.Value(0)).current;
  const thumbY = useRef(new Animated.Value(0)).current;
  const visibleRef = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [trackHeight, setTrackHeight] = useState(0);

  const hide = useCallback(
    (animated: boolean) => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      visibleRef.current = false;
      opacity.stopAnimation();
      if (animated) {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      } else {
        opacity.setValue(0);
      }
    },
    [opacity],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const viewH = layoutMeasurement.height;
      const contentH = contentSize.height;
      if (contentH <= viewH + 1 || viewH <= 0) {
        if (visibleRef.current) hide(false);
        return;
      }
      const trackH = Math.max(0, viewH - PAD * 2);
      const th = Math.max(MIN_THUMB, (viewH / contentH) * trackH);
      const maxOffset = contentH - viewH;
      const maxThumbY = Math.max(0, trackH - th);
      const ratio = maxOffset > 0 ? Math.min(1, Math.max(0, contentOffset.y / maxOffset)) : 0;
      thumbHeight.setValue(th);
      thumbY.setValue(PAD + ratio * maxThumbY);
      if (!visibleRef.current) {
        visibleRef.current = true;
        opacity.stopAnimation();
        opacity.setValue(1);
      }
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => hide(true), 250);
    },
    [hide, opacity, thumbHeight, thumbY],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setTrackHeight((prev) => (prev === h ? prev : h));
  }, []);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  const indicator =
    trackHeight > 0 ? (
      <Animated.View
        pointerEvents="none"
        style={[styles.track, { height: trackHeight, opacity }]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              backgroundColor: colors.mutedForeground,
              height: thumbHeight,
              transform: [{ translateY: thumbY }],
            },
          ]}
        />
      </Animated.View>
    ) : null;

  return { onScroll, onLayout, indicator };
}

export const CustomScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function CustomScrollView(props, ref) {
    const { onScroll, onLayout, indicator } = useScrollbar();
    return (
      <View style={styles.wrap}>
        <ScrollView
          ref={ref}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          {...props}
          onScroll={(e) => {
            onScroll(e);
            props.onScroll?.(e);
          }}
          onLayout={(e) => {
            onLayout(e);
            props.onLayout?.(e);
          }}
        />
        {indicator}
      </View>
    );
  },
);

export const CustomFlatList = forwardRef<FlatList<any>, FlatListProps<any>>(
  function CustomFlatList(props, ref) {
    const { onScroll, onLayout, indicator } = useScrollbar();
    return (
      <View style={styles.wrap}>
        <FlatList
          ref={ref}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          {...props}
          onScroll={(e) => {
            onScroll(e);
            props.onScroll?.(e);
          }}
          onLayout={(e) => {
            onLayout(e);
            props.onLayout?.(e);
          }}
        />
        {indicator}
      </View>
    );
  },
);

export const CustomSectionList = forwardRef<SectionList<any>, SectionListProps<any>>(
  function CustomSectionList(props, ref) {
    const { onScroll, onLayout, indicator } = useScrollbar();
    return (
      <View style={styles.wrap}>
        <SectionList
          ref={ref}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          {...props}
          onScroll={(e) => {
            onScroll(e);
            props.onScroll?.(e);
          }}
          onLayout={(e) => {
            onLayout(e);
            props.onLayout?.(e);
          }}
        />
        {indicator}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  track: {
    position: "absolute",
    right: 2,
    top: 0,
    width: 4,
  },
  thumb: {
    position: "absolute",
    left: 0,
    right: 0,
    width: 4,
    borderRadius: 2,
    opacity: 0.55,
  },
});
