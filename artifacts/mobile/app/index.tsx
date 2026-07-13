import { useAuth } from "@clerk/expo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from "react-native";
import { neon } from "@/constants/colors";
import { ONBOARDING_KEY } from "./onboarding";

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((v) => setOnboarded(v === "1"))
      .catch(() => setOnboarded(true));
  }, []);

  useEffect(() => {
    if (isLoaded) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // 3초 후에도 로드 안 되면 디버그 정보 표시
    timerRef.current = setTimeout(() => {
      const keyConfigured = Boolean(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY);
      const origin = typeof window !== "undefined" ? window.location.origin : "native";
      const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 60) : Platform.OS;
      const clerkLoaded = typeof window !== "undefined" && (window as any).Clerk ? "Clerk 객체 존재" : "Clerk 객체 없음";
      setDebugInfo(
        `Clerk isLoaded=false (3초 경과)\n` +
        `인증 키 설정: ${keyConfigured ? "예" : "아니요"}\n` +
        `Origin: ${origin}\n` +
        `${clerkLoaded}\n` +
        `UA: ${ua}`
      );
    }, 3000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLoaded]);

  if (!isLoaded || onboarded === null) {
    if (debugInfo) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: neon.background }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#FF6B6B", marginBottom: 12 }}>
            Clerk 초기화 실패
          </Text>
          <Text style={{ fontSize: 12, color: neon.muted, textAlign: "center", lineHeight: 20, fontFamily: "monospace" }}>
            {debugInfo}
          </Text>
          <TouchableOpacity
            onPress={() => { if (typeof window !== "undefined") window.location.reload(); }}
            style={{ marginTop: 20, padding: 14, backgroundColor: neon.purple, borderRadius: 12 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: neon.background }}>
        <ActivityIndicator size="large" color={neon.purple} />
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href={onboarded ? "/(tabs)" : "/onboarding"} />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
