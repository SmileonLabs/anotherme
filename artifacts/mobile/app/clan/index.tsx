import { CustomScrollView } from "@/components/CustomScroll";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetMyClanQueryKey,
  useGetMyClan,
  useLeaveClan,
} from "@workspace/api-client-react";
import type { ClanMember } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";
import { useThemeMode } from "@/hooks/useThemeMode";
import { gradients, gradientsDark } from "@/constants/colors";
import { crossAlert } from "@/lib/crossAlert";

const ARCHETYPE_LABEL: Record<string, string> = {
  strategist: "전략가형",
  harmonizer: "조율자형",
  explorer: "탐험가형",
  pioneer: "개척자형",
  sage: "현자형",
  entertainer: "재담꾼형",
  activist: "행동가형",
  observer: "관찰자형",
};

const ROLE_LABEL: Record<string, string> = {
  owner: "가문장",
  elder: "원로",
  member: "멤버",
};

export default function ClanHomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { scheme } = useThemeMode();
  const isDark = scheme === "dark";
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: myClan, isLoading, isError, refetch } = useGetMyClan();
  const leave = useLeaveClan();

  const onLeave = () => {
    if (!myClan) return;
    const isOwnerWithMembers =
      myClan.myRole === "owner" && myClan.memberCount > 1;
    const title = isOwnerWithMembers ? "탈퇴할 수 없음" : "가문 탈퇴";
    const message =
      myClan.myRole === "owner" && myClan.memberCount <= 1
        ? "가문에 혼자 남아 있어요. 탈퇴하면 가문이 삭제됩니다. 계속할까요?"
        : isOwnerWithMembers
          ? "가문장은 다른 멤버에게 권한을 넘긴 후 탈퇴할 수 있습니다."
          : "정말 이 가문에서 탈퇴할까요?";

    if (isOwnerWithMembers) {
      crossAlert(title, message);
      return;
    }

    crossAlert(title, message, [
      { text: "취소", style: "cancel" },
      {
        text: "탈퇴",
        style: "destructive",
        onPress: async () => {
          try {
            await leave.mutateAsync({ id: myClan.clan.id });
            await queryClient.invalidateQueries({ queryKey: getGetMyClanQueryKey() });
            await refetch();
          } catch {
            crossAlert("오류", "가문 탈퇴에 실패했어요.");
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <CustomScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
              가문 정보를 불러오지 못했어요.
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.primaryBtnText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : !myClan ? (
          <EmptyState colors={colors} isDark={isDark} router={router} />
        ) : (
          <View>
            <LinearGradient
              colors={(isDark ? gradientsDark : gradients).soft}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={[styles.emblem, { backgroundColor: colors.background }]}>
                <Feather name="shield" size={26} color={colors.primary} />
              </View>
              <Text style={[styles.clanName, { color: colors.foreground }]}>
                {myClan.clan.name}
              </Text>
              {myClan.clan.description ? (
                <Text style={[styles.clanDesc, { color: colors.mutedForeground }]}>
                  {myClan.clan.description}
                </Text>
              ) : null}
              <View style={styles.statRow}>
                <Stat label="레벨" value={`Lv.${myClan.clan.level}`} colors={colors} />
                <Stat label="EXP" value={myClan.clan.exp.toLocaleString()} colors={colors} />
                <Stat label="멤버" value={`${myClan.memberCount}명`} colors={colors} />
                <Stat label="내 역할" value={ROLE_LABEL[myClan.myRole] ?? myClan.myRole} colors={colors} />
              </View>
            </LinearGradient>

            {myClan.clan.preferredArchetype ? (
              <InfoCard
                colors={colors}
                icon="compass"
                title="선호 아키타입"
                body={ARCHETYPE_LABEL[myClan.clan.preferredArchetype] ?? myClan.clan.preferredArchetype}
              />
            ) : null}
            {myClan.clan.clanValues ? (
              <InfoCard colors={colors} icon="heart" title="가문 가치관" body={myClan.clan.clanValues} />
            ) : null}

            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>멤버</Text>
            <View style={[styles.listCard, { backgroundColor: colors.background }]}>
              {myClan.recentMembers.map((m, i) => (
                <MemberRow key={m.userId} member={m} first={i === 0} colors={colors} />
              ))}
            </View>

            <Pressable
              onPress={onLeave}
              disabled={leave.isPending}
              style={[styles.leaveBtn, { borderColor: colors.destructive }]}
            >
              <Feather name="log-out" size={15} color={colors.destructive} />
              <Text style={[styles.leaveText, { color: colors.destructive }]}>가문 탈퇴</Text>
            </Pressable>
          </View>
        )}
      </CustomScrollView>
    </View>
  );
}

function EmptyState({
  colors,
  isDark,
  router,
}: {
  colors: ReturnType<typeof useColors>;
  isDark: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <View>
      <LinearGradient
        colors={(isDark ? gradientsDark : gradients).soft}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={[styles.emblem, { backgroundColor: colors.background }]}>
          <Feather name="shield" size={26} color={colors.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
          아직 소속된 가문이 없습니다.
        </Text>
        <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
          비슷한 정체성을 가진 Another Me들과 함께 성장해보세요.
        </Text>
      </LinearGradient>

      <View style={styles.emptyCtaWrap}>
        <Pressable
          onPress={() => router.push("/clan/create")}
          style={[styles.primaryBtn, { backgroundColor: colors.foreground }]}
        >
          <Feather name="plus" size={16} color={colors.background} />
          <Text style={[styles.primaryBtnText, { color: colors.background }]}>가문 만들기</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/clan/browse")}
          style={[styles.outlineBtn, { borderColor: colors.border }]}
        >
          <Feather name="search" size={16} color={colors.foreground} />
          <Text style={[styles.outlineBtnText, { color: colors.foreground }]}>가문 찾아보기</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Stat({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.statCol}>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function InfoCard({
  colors,
  icon,
  title,
  body,
}: {
  colors: ReturnType<typeof useColors>;
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  body: string;
}) {
  return (
    <View style={[styles.infoCard, { backgroundColor: colors.background }]}>
      <View style={styles.infoHead}>
        <Feather name={icon} size={14} color={colors.primary} />
        <Text style={[styles.infoTitle, { color: colors.mutedForeground }]}>{title}</Text>
      </View>
      <Text style={[styles.infoBody, { color: colors.foreground }]}>{body}</Text>
    </View>
  );
}

function MemberRow({
  member,
  first,
  colors,
}: {
  member: ClanMember;
  first: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.row,
        {
          borderTopColor: colors.border,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Avatar uri={member.avatarUrl} name={member.displayName} size={40} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
          {member.displayName}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
          Lv.{member.level} · {member.title} · {member.archetypeLabel}
        </Text>
      </View>
      <View style={[styles.roleBadge, { backgroundColor: `${colors.primary}18` }]}>
        <Text style={[styles.roleText, { color: colors.primary }]}>
          {ROLE_LABEL[member.role] ?? member.role}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { paddingTop: 60, alignItems: "center", gap: 16 },
  bodyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  hero: { margin: 16, marginBottom: 8, borderRadius: 22, padding: 24, alignItems: "center" },
  emblem: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  clanName: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  clanDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    textAlign: "center",
    lineHeight: 19,
  },
  statRow: { flexDirection: "row", marginTop: 18, alignSelf: "stretch" },
  statCol: { flex: 1, alignItems: "center", gap: 3 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },

  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 4, textAlign: "center" },
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 19,
  },
  emptyCtaWrap: { paddingHorizontal: 16, gap: 10, marginTop: 8 },

  infoCard: { marginHorizontal: 16, marginTop: 8, borderRadius: 16, padding: 16, gap: 6 },
  infoHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  infoBody: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 20 },

  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 8,
  },
  listCard: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  roleText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 12,
  },
  primaryBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  outlineBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  leaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  leaveText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
