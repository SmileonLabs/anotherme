import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from "react-native";

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoaded) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // 3초 후에도 로드 안 되면 디버그 정보 표시
    timerRef.current = setTimeout(() => {
      if (Platform.OS === "web") {
        const key = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || "(없음)";
        const domain = process.env.EXPO_PUBLIC_DOMAIN || "(없음)";
        const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || "(없음)";
        const origin = typeof window !== "undefined" ? window.location.origin : "(없음)";
        const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 60) : "";
        const clerkLoaded = typeof window !== "undefined" && (window as any).Clerk ? "Clerk 객체 존재" : "Clerk 객체 없음";
        setDebugInfo(
          `Clerk isLoaded=false (3초 경과)\n` +
          `키: ${key.slice(0, 20)}...\n` +
          `Proxy: ${proxyUrl}\n` +
          `도메인: ${domain}\n` +
          `Origin: ${origin}\n` +
          `${clerkLoaded}\n` +
          `UA: ${ua}`
        );
      }
    }, 3000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLoaded]);

  if (!isLoaded) {
    if (debugInfo) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#fff" }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#c00", marginBottom: 12 }}>
            Clerk 초기화 실패
          </Text>
          <Text style={{ fontSize: 12, color: "#333", textAlign: "center", lineHeight: 20, fontFamily: "monospace" }}>
            {debugInfo}
          </Text>
          <TouchableOpacity
            onPress={() => { if (typeof window !== "undefined") window.location.reload(); }}
            style={{ marginTop: 20, padding: 14, backgroundColor: "#5B6EE8", borderRadius: 12 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#5B6EE8" />
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
