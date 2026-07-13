import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { neon } from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { ThemeModeContext, useThemeMode } from "@/hooks/useThemeMode";
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
      {isIOS ? (
        <SymbolView name={ios as any} tintColor={color} size={24} />
      ) : (
        <Feather
          name={feather}
          size={22}
          color={color}
          style={focused ? styles.tabIconGlyphActive : undefined}
        />
      )}
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#B96CFF",
        tabBarInactiveTintColor: "#8D8999",
        headerShown: false,
        sceneStyle: { backgroundColor: neon.background },
        tabBarLabelStyle: {
          fontFamily: "Inter_600SemiBold",
          fontSize: 10,
          lineHeight: 14,
          marginTop: 1,
        },
        tabBarItemStyle: { paddingTop: 5 },
        tabBarStyle: {
          position: "absolute",
          height: 82 + (isWeb ? pwaBottom : 0),
          paddingTop: 5,
          paddingBottom: isWeb ? Math.max(6, pwaBottom) : 6,
          backgroundColor: isIOS ? "transparent" : "#05040D",
          borderTopWidth: 1,
          borderTopColor: "rgba(139, 92, 246, 0.24)",
          elevation: 0,
          shadowColor: "#7C3AED",
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.12,
          shadowRadius: 14,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <LinearGradient
              colors={["rgba(16,12,34,0.99)", "rgba(5,4,13,1)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            >
              <View pointerEvents="none" style={styles.tabBarTopGlow} />
            </LinearGradient>
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
  const themeMode = useThemeMode();
  const darkTabsTheme = React.useMemo(
    () => ({ ...themeMode, scheme: "dark" as const }),
    [themeMode],
  );

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <ThemeModeContext.Provider value={darkTabsTheme}>
      <ClassicTabLayout />
    </ThemeModeContext.Provider>
  );
}

const styles = StyleSheet.create({
  tabIconWrap: {
    width: 38,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconWrapActive: {
    backgroundColor: "transparent",
  },
  tabIconGlyphActive: {
    textShadowColor: "#C06CFF",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  tabBarTopGlow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: "rgba(183, 117, 255, 0.38)",
  },
});
