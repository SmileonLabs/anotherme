import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Redirect, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useThemeMode } from "@/hooks/useThemeMode";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>홈</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chats">
        <Icon sf={{ default: "bubble.left.and.bubble.right", selected: "bubble.left.and.bubble.right.fill" }} />
        <Label>채팅</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="battle">
        <Icon sf={{ default: "mic", selected: "mic.fill" }} />
        <Label>배틀</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="dungeon">
        <Icon sf={{ default: "map", selected: "map.fill" }} />
        <Label>던전</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="persona">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>자아</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const { scheme } = useThemeMode();
  const isDark = scheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

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
          ...(isWeb ? { height: 84 } : {}),
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
        name="chats"
        options={{ title: "채팅", tabBarIcon: tabIcon("bubble.left.and.bubble.right", "message-circle") }}
      />
      <Tabs.Screen
        name="battle"
        options={{ title: "배틀", tabBarIcon: tabIcon("mic", "mic") }}
      />
      <Tabs.Screen
        name="dungeon"
        options={{ title: "던전", tabBarIcon: tabIcon("map", "compass") }}
      />
      <Tabs.Screen
        name="persona"
        options={{ title: "자아", tabBarIcon: tabIcon("person", "user") }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useEffect(() => {
    if (isSignedIn) {
      setAuthTokenGetter(() => getToken());
    }
  }, [isSignedIn, getToken]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
