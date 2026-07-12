import { Feather } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { usePlayMode, type PlayMode } from "@/hooks/usePlayMode";

const MODE_TARGETS: Record<PlayMode, Href> = {
  fan: "/(tabs)/chats" as Href,
  star: "/(tabs)/feed" as Href,
};

export function ModeSwitch() {
  const colors = useColors();
  const router = useRouter();
  const { mode, starUnlocked, isChanging, setMode } = usePlayMode();

  const selectMode = async (nextMode: PlayMode) => {
    if (nextMode === "star" && !starUnlocked) {
      router.push(MODE_TARGETS.star);
      return;
    }
    if (nextMode === mode) return;
    await setMode(nextMode);
    router.replace(MODE_TARGETS[nextMode]);
  };

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.muted, borderColor: colors.border },
      ]}
    >
      {(["fan", "star"] as PlayMode[]).map((item) => {
        const active = mode === item;
        const locked = item === "star" && !starUnlocked;
        return (
          <Pressable
            key={item}
            onPress={() => void selectMode(item)}
            disabled={isChanging}
            style={[
              styles.segment,
              {
                backgroundColor: active ? colors.foreground : "transparent",
                opacity: isChanging ? 0.7 : 1,
              },
            ]}
          >
            {locked ? (
              <Feather
                name="lock"
                size={12}
                color={active ? colors.background : colors.mutedForeground}
              />
            ) : null}
            <Text
              style={[
                styles.text,
                { color: active ? colors.background : colors.mutedForeground },
              ]}
            >
              {item === "fan" ? "FAN" : "STAR"}
            </Text>
          </Pressable>
        );
      })}
      {isChanging ? (
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.loader}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    padding: 3,
    position: "relative",
  },
  segment: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 4,
    minWidth: 72,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  text: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.5 },
  loader: { marginLeft: 8, marginRight: 4 },
});
