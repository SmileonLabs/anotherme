import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { setBaseUrl } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CallProvider } from "@/components/CallProvider";
import { PushRegistrar } from "@/components/PushRegistrar";
import { ForegroundNotifier } from "@/components/ForegroundNotifier";
import { ThemeModeProvider } from "@/hooks/useThemeMode";
import { useColors } from "@/hooks/useColors";

const domain = process.env.EXPO_PUBLIC_DOMAIN;
if (domain) setBaseUrl(`https://${domain}`);

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

// SplashScreen is native-only; ignore errors on web
try {
  SplashScreen.preventAutoHideAsync();
} catch {}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
});

function RootLayoutNav() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerTitleStyle: { color: colors.foreground },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen
        name="friends/add"
        options={{ title: "친구 추가", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="friends/requests"
        options={{ title: "친구 요청", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="group/create"
        options={{ title: "그룹 채팅 만들기", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="group/invite"
        options={{ title: "친구 초대", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="dungeon/create"
        options={{ title: "새 던전", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="battle/create"
        options={{ title: "토크배틀", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="battle/topic"
        options={{ title: "주제 선택", headerBackTitle: "Back" }}
      />
      <Stack.Screen name="battle/[id]" options={{ headerShown: false }} />
      <Stack.Screen
        name="profile/edit"
        options={{ title: "프로필 수정", headerBackTitle: "Back" }}
      />
      <Stack.Screen name="friends/index" options={{ headerShown: false }} />
      <Stack.Screen name="settings/index" options={{ headerShown: false }} />
      <Stack.Screen
        name="profile/ranking"
        options={{ title: "랭킹", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="clan/index"
        options={{ title: "가문", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="clan/create"
        options={{ title: "가문 만들기", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="clan/browse"
        options={{ title: "가문 찾기", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="clan/memories"
        options={{ title: "가문 기억", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="clan/memory-new"
        options={{ title: "기억 남기기", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="clan/wars"
        options={{ title: "가문전", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="clan/war-create"
        options={{ title: "가문전 만들기", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="clan/war/[id]"
        options={{ title: "가문전", headerBackTitle: "Back" }}
      />
      <Stack.Screen name="quests/index" options={{ headerShown: false }} />
      <Stack.Screen
        name="settings/notifications"
        options={{ title: "알림 설정", headerBackTitle: "Back" }}
      />
      <Stack.Screen
        name="settings/blocked"
        options={{ title: "차단 목록", headerBackTitle: "Back" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      try { SplashScreen.hideAsync(); } catch {}
    }
  }, [fontsLoaded, fontError]);

  // On web, useFonts loads via CSS and may never flip to true —
  // don't block rendering; proceed immediately.
  if (Platform.OS !== "web" && !fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <ThemeModeProvider>
        <ClerkProvider
          publishableKey={publishableKey}
          // tokenCache uses expo-secure-store which is native-only
          tokenCache={Platform.OS !== "web" ? tokenCache : undefined}
          proxyUrl={proxyUrl}
        >
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <CallProvider>
                {Platform.OS === "web" ? (
                  <>
                    <PushRegistrar />
                    <RootLayoutNav />
                    <ForegroundNotifier />
                  </>
                ) : (
                  <KeyboardProvider>
                    <RootLayoutNav />
                  </KeyboardProvider>
                )}
              </CallProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </SafeAreaProvider>
        </ClerkProvider>
      </ThemeModeProvider>
    </ErrorBoundary>
  );
}
