import { CustomScrollView } from "@/components/CustomScroll";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetMe, useGetMyPersona } from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";
import { useThemeMode } from "@/hooks/useThemeMode";
import { gradients, gradientsDark } from "@/constants/colors";

type StatKey =
  | "logic"
  | "empathy"
  | "wit"
  | "knowledge"
  | "conviction"
  | "emotion"
  | "decisiveness";

const STAT_META: {
  key: StatKey;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}[] = [
  { key: "logic", label: "논리", icon: "cpu", color: "#4F7BF5" },
  { key: "empathy", label: "공감", icon: "heart", color: "#FF6B9D" },
  { key: "wit", label: "위트", icon: "zap", color: "#F5A623" },
  { key: "knowledge", label: "지식", icon: "book-open", color: "#00B488" },
  { key: "conviction", label: "신념", icon: "flag", color: "#7C5CFC" },
  { key: "emotion", label: "감정", icon: "droplet", color: "#FB7185" },
  { key: "decisiveness", label: "결단", icon: "target", color: "#FB923C" },
];

function personaTitle(level: number): string {
  if (level >= 30) return "또 다른 자아 · 각성";
  if (level >= 20) return "또 다른 자아 · 완성형";
  if (level >= 12) return "성장하는 분신";
  if (level >= 6) return "깨어나는 분신";
  if (level >= 2) return "형성 중인 자아";
  return "씨앗 자아";
}

export default function PersonaScreen() {
  const router = useRouter();
  const colors = useColors();
  const { scheme } = useThemeMode();
  const isDark = scheme === "dark";
  const insets = useSafeAreaInsets();

  const { data: me } = useGetMe();
  const { data: persona, isLoading, isError, refetch } = useGetMyPersona();

  const level = persona?.level ?? 1;
  const xpInto = persona?.xpIntoLevel ?? 0;
  const xpFor = persona?.xpForNextLevel ?? 100;
  const progress = Math.min(100, Math.round((xpInto / (xpFor || 1)) * 100));
  const stats = persona?.stats;
  const maxStat = stats
    ? Math.max(1, ...STAT_META.map((m) => stats[m.key] ?? 0))
    : 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <CustomScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
              어나더 미를 불러오지 못했어요.
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Hero: identity + level */}
            <LinearGradient
              colors={(isDark ? gradientsDark : gradients).soft}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroAvatarWrap}>
                <Avatar uri={me?.profileImageUrl} name={me?.nickname ?? "나"} size={84} />
                <View style={[styles.levelChip, { backgroundColor: colors.foreground }]}>
                  <Text style={[styles.levelChipText, { color: colors.background }]}>
                    Lv.{level}
                  </Text>
                </View>
              </View>
              <Text style={[styles.heroName, { color: colors.foreground }]} numberOfLines={1}>
                {me?.nickname ?? "나"}의 어나더 미
              </Text>
              <Text style={[styles.heroTitle, { color: colors.mutedForeground }]}>
                {personaTitle(level)}
              </Text>

              {/* XP progress */}
              <View
                style={[
                  styles.xpTrack,
                  { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)" },
                ]}
              >
                <View
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    borderRadius: 5,
                    backgroundColor: "#7C5CFC",
                  }}
                />
              </View>
              <Text style={[styles.xpText, { color: colors.mutedForeground }]}>
                다음 레벨까지 {Math.max(0, xpFor - xpInto)} XP · {xpInto} / {xpFor}
              </Text>
            </LinearGradient>

            {/* Stats */}
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>능력치</Text>
            <View style={[styles.statsCard, { backgroundColor: colors.background }]}>
              {STAT_META.map((m, i) => {
                const value = stats?.[m.key] ?? 0;
                const ratio = Math.round((value / maxStat) * 100);
                return (
                  <View
                    key={m.key}
                    style={[
                      styles.statRow,
                      {
                        borderTopColor: colors.border,
                        borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    <View style={[styles.statIcon, { backgroundColor: `${m.color}22` }]}>
                      <Feather name={m.icon} size={16} color={m.color} />
                    </View>
                    <View style={styles.statBody}>
                      <View style={styles.statTopRow}>
                        <Text style={[styles.statLabel, { color: colors.foreground }]}>
                          {m.label}
                        </Text>
                        <Text style={[styles.statValue, { color: colors.mutedForeground }]}>
                          {value}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.statBarTrack,
                          { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" },
                        ]}
                      >
                        <View
                          style={{
                            width: `${ratio}%`,
                            height: "100%",
                            borderRadius: 3,
                            backgroundColor: m.color,
                          }}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* AI summary (reserved for a later phase) */}
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>AI 분석</Text>
            <View style={[styles.summaryCard, { backgroundColor: colors.background }]}>
              {persona?.summary ? (
                <Text style={[styles.summaryText, { color: colors.foreground }]}>
                  {persona.summary}
                </Text>
              ) : (
                <View style={styles.summaryEmpty}>
                  <Feather name="cpu" size={20} color={colors.mutedForeground} />
                  <Text style={[styles.summaryEmptyText, { color: colors.mutedForeground }]}>
                    활동을 쌓으면 AI가 당신의 또 다른 자아를 분석해줍니다.
                  </Text>
                </View>
              )}
            </View>

            {/* How to grow */}
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              어떻게 성장하나요?
            </Text>
            <View style={[styles.tipsCard, { backgroundColor: colors.background }]}>
              <TipRow icon="message-circle" text="채팅하면 공감이 자라요" colors={colors} />
              <TipRow icon="mic" text="토크배틀에 참여하면 논리·위트가 올라요" colors={colors} />
              <TipRow icon="award" text="배틀에서 이기면 신념이 강해져요" colors={colors} />
              <TipRow icon="compass" text="던전을 모험하면 결단·지식이 늘어요" colors={colors} last />
            </View>

            <Pressable
              onPress={() => router.push({ pathname: "/battle/create", params: { mode: "ai" } })}
              style={({ pressed }) => [
                styles.ctaBtn,
                { backgroundColor: colors.foreground, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Feather name="zap" size={18} color={colors.background} />
              <Text style={[styles.ctaText, { color: colors.background }]}>
                지금 성장하러 가기
              </Text>
            </Pressable>
          </>
        )}
      </CustomScrollView>
    </View>
  );
}

function TipRow({
  icon,
  text,
  colors,
  last,
}: {
  icon: keyof typeof Feather.glyphMap;
  text: string;
  colors: ReturnType<typeof useColors>;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.tipRow,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Feather name={icon} size={16} color={colors.primary} />
      <Text style={[styles.tipText, { color: colors.foreground }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { paddingTop: 80, alignItems: "center", gap: 16 },
  errorText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  retryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },

  hero: {
    margin: 16,
    borderRadius: 22,
    padding: 24,
    alignItems: "center",
  },
  heroAvatarWrap: { alignItems: "center" },
  levelChip: {
    marginTop: -14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  levelChipText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  heroName: { fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 12 },
  heroTitle: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 4 },
  xpTrack: {
    width: "100%",
    height: 10,
    borderRadius: 5,
    marginTop: 18,
    overflow: "hidden",
  },
  xpText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 8 },

  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  statsCard: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden" },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statBody: { flex: 1, gap: 6 },
  statTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  statValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  statBarTrack: { height: 6, borderRadius: 3, overflow: "hidden" },

  summaryCard: { marginHorizontal: 16, borderRadius: 16, padding: 18 },
  summaryText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  summaryEmpty: { alignItems: "center", gap: 10, paddingVertical: 8 },
  summaryEmptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },

  tipsCard: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden", paddingHorizontal: 16 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  tipText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },

  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 15,
    borderRadius: 14,
  },
  ctaText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
