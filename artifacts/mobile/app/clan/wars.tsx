import { CustomScrollView } from "@/components/CustomScroll";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetMyClan, useListClanWars } from "@workspace/api-client-react";
import type { ClanWarSummary } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import {
  WAR_STATUS_LABEL,
  WAR_STATUS_TONE,
  warOutcomeLabel,
} from "@/lib/clanWar";

export default function ClanWarsScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: myClan } = useGetMyClan();
  const myClanId = myClan?.clan.id ?? null;
  const canCreate = myClan?.myRole === "owner" || myClan?.myRole === "elder";

  const { data: wars, isLoading, isError, refetch } = useListClanWars();

  const open = (wars ?? []).filter((w) => w.status === "open");
  const ongoing = (wars ?? []).filter(
    (w) => w.status === "matched" || w.status === "active" || w.status === "completing",
  );
  const done = (wars ?? []).filter(
    (w) => w.status === "completed" || w.status === "cancelled",
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <CustomScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        {canCreate ? (
          <Pressable
            onPress={() => router.push("/clan/war-create")}
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.createText}>가문전 만들기</Text>
          </Pressable>
        ) : null}

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>
              가문전 목록을 불러오지 못했어요.
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : (wars?.length ?? 0) === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Feather name="zap" size={20} color={colors.mutedForeground} />
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>
              아직 가문전이 없어요. 첫 도전을 열어보세요.
            </Text>
          </View>
        ) : (
          <>
            <Section title="공개 도전" wars={open} myClanId={myClanId} colors={colors} router={router} />
            <Section title="진행 중" wars={ongoing} myClanId={myClanId} colors={colors} router={router} />
            <Section title="지난 가문전" wars={done} myClanId={myClanId} colors={colors} router={router} />
          </>
        )}
      </CustomScrollView>
    </View>
  );
}

function Section({
  title,
  wars,
  myClanId,
  colors,
  router,
}: {
  title: string;
  wars: ClanWarSummary[];
  myClanId: string | null;
  colors: ReturnType<typeof useColors>;
  router: ReturnType<typeof useRouter>;
}) {
  if (wars.length === 0) return null;
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
      <View style={{ gap: 10 }}>
        {wars.map((w) => (
          <WarCard
            key={w.id}
            war={w}
            myClanId={myClanId}
            colors={colors}
            onPress={() => router.push({ pathname: "/clan/war/[id]", params: { id: w.id } })}
          />
        ))}
      </View>
    </View>
  );
}

function WarCard({
  war,
  myClanId,
  colors,
  onPress,
}: {
  war: ClanWarSummary;
  myClanId: string | null;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const tone = WAR_STATUS_TONE(war.status, colors);
  const outcome = warOutcomeLabel(war, myClanId);
  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: colors.background }]}>
      <View style={styles.cardHead}>
        <View style={[styles.badge, { backgroundColor: `${tone}1f` }]}>
          <Text style={[styles.badgeText, { color: tone }]}>
            {WAR_STATUS_LABEL[war.status] ?? war.status}
          </Text>
        </View>
        <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
          참가 {war.participantCount}명
        </Text>
      </View>
      <Text style={[styles.cardTopic, { color: colors.foreground }]} numberOfLines={2}>
        {war.topic}
      </Text>
      <Text style={[styles.cardClans, { color: colors.mutedForeground }]} numberOfLines={1}>
        {war.challengerClanName ?? "도전 가문"}
        <Text style={{ color: colors.primary }}> vs </Text>
        {war.opponentClanName ?? "상대 모집 중"}
      </Text>
      {war.status === "completed" ? (
        <Text style={[styles.cardScore, { color: colors.foreground }]}>
          {war.challengerScore} : {war.opponentScore}
          {outcome ? <Text style={{ color: colors.primary }}>{`  ${outcome}`}</Text> : null}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    marginBottom: 18,
  },
  createText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  center: { alignItems: "center", paddingVertical: 48, gap: 14 },
  muted: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  empty: {
    alignItems: "center",
    gap: 10,
    padding: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 14,
    marginBottom: 10,
  },
  card: { borderRadius: 14, padding: 14 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  cardMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardTopic: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 6 },
  cardClans: { fontSize: 13, fontFamily: "Inter_500Medium" },
  cardScore: { fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 8 },
});
