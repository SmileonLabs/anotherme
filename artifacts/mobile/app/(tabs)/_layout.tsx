import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Redirect, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { useThemeMode } from "@/hooks/useThemeMode";
import { usePwaBottomInset } from "@/hooks/usePwaBottomInset";
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>홈</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="feed">
        <Icon sf={{ default: "sparkles", selected: "sparkles" }} />
        <Label>피드</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chats">
        <Icon sf={{ default: "bubble.left.and.bubble.right", selected: "bubble.left.and.bubble.right.fill" }} />
        <Label>채팅</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="quests">
        <Icon sf={{ default: "target", selected: "target" }} />
        <Label>퀘스트</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="persona">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>마이</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

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
  ) => ({ color }: { color: string }) =>
    isIOS ? (
      <SymbolView name={ios as any} tintColor={color} size={24} />
    ) : (
      <Feather name={feather} size={22} color={color} />
    );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarLabelStyle: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
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
        name="feed"
        options={{ title: "피드", tabBarIcon: tabIcon("sparkles", "star") }}
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
        options={{ title: "퀘스트", tabBarIcon: tabIcon("target", "target") }}
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

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
