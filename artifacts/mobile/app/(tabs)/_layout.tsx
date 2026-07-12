import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { useThemeMode } from "@/hooks/useThemeMode";
import { usePwaBottomInset } from "@/hooks/usePwaBottomInset";
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";

function ClassicTabLayout() {
  const colors = useColors();
  const { scheme } = useThemeMode();
  const { count: unreadCount } = useUnreadMessageCount();
  const isDark = scheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const pwaBottom = usePwaBottomInset();

  const tabIcon = (
    ios: string,
    feather: keyof typeof Feather.glyphMap,
  ) => ({ color, focused }: { color: string; focused: boolean }) => (
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
      {focused ? <View pointerEvents="none" style={styles.tabIconGlow} /> : null}
      {isIOS ? (
        <SymbolView name={ios as any} tintColor={color} size={24} />
      ) : (
        <Feather name={feather} size={22} color={color} />
      )}
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarLabelStyle: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : "#070711",
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: "rgba(157, 99, 255, 0.32)",
          elevation: 0,
          ...(isWeb ? { height: 84 + pwaBottom, paddingBottom: pwaBottom } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "홈", tabBarIcon: tabIcon("house", "home") }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: "검색", tabBarIcon: tabIcon("magnifyingglass", "search") }}
      />
      <Tabs.Screen
        name="feed"
        options={{ title: "피드", tabBarIcon: tabIcon("sparkles", "grid") }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "채팅",
          tabBarIcon: tabIcon("bubble.left.and.bubble.right", "message-circle"),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            color: colors.primaryForeground,
            fontFamily: "Inter_700Bold",
            fontSize: 10,
          },
        }}
      />
      <Tabs.Screen
        name="battle"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="dungeon"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="quests"
        options={{ title: "미션", tabBarIcon: tabIcon("target", "star") }}
      />
      <Tabs.Screen
        name="persona"
        options={{ title: "마이", tabBarIcon: tabIcon("person", "user") }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({
  tabIconWrap: {
    width: 42,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconWrapActive: {
    backgroundColor: "rgba(116, 45, 255, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(190, 116, 255, 0.72)",
    shadowColor: "#A64DFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 10,
    elevation: 10,
  },
  tabIconGlow: {
    position: "absolute",
    width: 30,
    height: 24,
    borderRadius: 15,
    backgroundColor: "rgba(171, 75, 255, 0.34)",
  },
});
