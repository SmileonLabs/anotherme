import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useGenerateDailyTalkReward } from "@/hooks/useDailyTalkReward";

function errorMessage(err: unknown): string {
  const apiError = err as {
    status?: number;
    data?: { message?: string; error?: string; retryAfter?: number };
  } | null;
  const data = apiError?.data;
  if (apiError?.status === 429) {
    const seconds = Math.max(1, Number(data?.retryAfter) || 60);
    const minutes = Math.ceil(seconds / 60);
    return minutes > 1
      ? `요청이 많아 잠시 쉬고 있어요. 약 ${minutes}분 후 다시 시도해 주세요.`
      : "요청이 많아 잠시 쉬고 있어요. 1분 후 다시 시도해 주세요.";
  }
  return (
    data?.message ??
    "오늘의 톡 리워드를 생성하지 못했어요. 잠시 후 다시 시도해 주세요."
  );
}

export default function DailyTalkRewardGenerateScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const generate = useGenerateDailyTalkReward();
  const started = React.useRef(false);
  const [messageIndex, setMessageIndex] = React.useState(0);
  const loadingMessages = [
    "오늘의 대화를 정리하고 있어요.",
    "당신의 하루를 일기로 바꾸는 중이에요.",
    "오늘의 대화 가치를 분석하고 있어요.",
  ];

  React.useEffect(() => {
    const timer = setInterval(
      () => setMessageIndex((value) => (value + 1) % loadingMessages.length),
      1800,
    );
    return () => clearInterval(timer);
  }, [loadingMessages.length]);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    generate.mutate(undefined, {
      onSuccess: (reward) =>
        router.replace(`/daily-talk-reward/${reward.id}` as never),
    });
  }, [generate, router]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + 24 },
      ]}
    >
      <View style={styles.centerBox}>
        <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
          {generate.isError ? (
            <Feather name="alert-circle" size={34} color={colors.destructive} />
          ) : (
            <ActivityIndicator color={colors.primary} size="large" />
          )}
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Talk to Earn
        </Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          {generate.isError
            ? errorMessage(generate.error)
            : loadingMessages[messageIndex]}
        </Text>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>
          원문 대화는 피드에 공개되지 않고, AI 일기는 저장 전 직접 확인할 수
          있어요.
        </Text>
      </View>

      {generate.isError ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={generate.isPending}
            onPress={() =>
              generate.mutate(undefined, {
                onSuccess: (reward) =>
                  router.replace(`/daily-talk-reward/${reward.id}` as never),
              })
            }
            style={[
              styles.primaryButton,
              { backgroundColor: colors.primary },
              generate.isPending && styles.disabled,
            ]}
          >
            <Text
              style={[styles.primaryText, { color: colors.primaryForeground }]}
            >
              다시 시도
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            style={[styles.secondaryButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.secondaryText, { color: colors.foreground }]}>
              돌아가기
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  centerBox: { alignItems: "center", gap: 14 },
  iconWrap: {
    alignItems: "center",
    borderRadius: 28,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.7 },
  body: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    lineHeight: 24,
    textAlign: "center",
  },
  caption: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 320,
    textAlign: "center",
  },
  actions: { gap: 10, marginTop: 28 },
  primaryButton: {
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 14,
  },
  primaryText: { fontFamily: "Inter_700Bold", fontSize: 15 },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  secondaryText: { fontFamily: "Inter_700Bold", fontSize: 15 },
  disabled: { opacity: 0.55 },
});
