import { CustomScrollView } from "@/components/CustomScroll";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCreateLifeQuest, useGetActiveLifeQuest } from "@workspace/api-client-react";
import { crossAlert } from "@/lib/crossAlert";
import { useColors } from "@/hooks/useColors";
import { useThemeMode } from "@/hooks/useThemeMode";
import { gradients, gradientsDark } from "@/constants/colors";
import {
  LIFE_QUEST_THEMES,
  PROMOTED_LIFE_QUEST_THEMES,
  themeMeta,
  type LifeQuestThemeKey,
} from "@/constants/lifeQuest";
import { usePlayMode } from "@/hooks/usePlayMode";
import { useTorimia, type TorimiaRequirement } from "@/hooks/useTorimia";
import { useNftRpgContent } from "@/hooks/useNftCollections";

export default function LifeQuestLobbyScreen() {
  const router = useRouter();
  const colors = useColors();
  const { scheme } = useThemeMode();
  const isDark = scheme === "dark";
  const insets = useSafeAreaInsets();

  const { mode, equippedStar, starUnlocked, setMode, isChanging } = usePlayMode();
  const missionReady = starUnlocked && !!equippedStar && mode === "star";
  const { data: rpgContent } = useNftRpgContent(equippedStar?.collectionId ?? null);
  const { state: torimia, requirements, refetch: refetchTorimia, openTorimia, isOpening } = useTorimia();
  const { data: active, refetch, isRefetching } = useGetActiveLifeQuest({
    query: { enabled: missionReady, queryKey: ["activeLifeQuest", equippedStar?.id ?? "none"] },
  });
  const createQuest = useCreateLifeQuest();
  const [starting, setStarting] = useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      refetchTorimia();
      if (missionReady) refetch();
    }, [missionReady, refetch, refetchTorimia]),
  );

  const activeQuest = active?.quest ?? null;
  const promoted = !!torimia?.promoted || equippedStar?.stage === "promoted";
  const missionLabel = "성장 RPG";
  const themeOptions = promoted ? PROMOTED_LIFE_QUEST_THEMES : LIFE_QUEST_THEMES;

  const start = async (theme: LifeQuestThemeKey | null) => {
    if (!missionReady) {
      crossAlert("STAR 모드 필요", `${missionLabel}은 STAR 모드에서만 진행할 수 있어요.`);
      return;
    }
    if (createQuest.isPending) return;
    setStarting(theme ?? "random");
    try {
      const quest = await createQuest.mutateAsync({
        data: { theme: theme ?? null },
      });
      router.push({ pathname: "/dungeon/[id]", params: { id: quest.id } });
    } catch {
      crossAlert("오류", `${missionLabel}을 생성하지 못했어요. 잠시 후 다시 시도해주세요.`);
    } finally {
      setStarting(null);
    }
  };

  const busy = createQuest.isPending;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.brand, { color: colors.foreground }]}>{missionLabel}</Text>
      </View>

      <CustomScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
        }
      >
        {missionReady && rpgContent ? (
          <View style={[styles.rpgContentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.rpgContentTitle, { color: colors.foreground }]}>{rpgContent.ipName} 성장 이야기</Text>
            <Text style={[styles.rpgContentBody, { color: colors.mutedForeground }]}>{rpgContent.story.opening}</Text>
            {rpgContent.missions.slice(0, 3).map((mission) => (
              <View key={mission.id} style={styles.rpgMissionRow}>
                <Feather name="target" size={15} color={colors.primary} />
                <Text style={[styles.rpgMissionText, { color: colors.foreground }]}>{mission.title} · +{mission.xp} XP</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          {promoted
            ? "공식 STAR로 무대와 팬클럽 활동을 확장해요. 팬들과 함께 세계관과 기록을 쌓아갑니다."
            : "장착한 NFT의 IP에 맞는 이야기와 미션으로 캐릭터를 성장시키세요."}
        </Text>
        <Text style={[styles.identityHint, { color: colors.primary }]}>{equippedStar ? `장착 STAR · ${equippedStar.displayName}` : "FAN · STAR NFT를 장착하면 STAR 미션이 열립니다"}</Text>

        {!missionReady ? (
          <MissionGate
            colors={colors}
            starUnlocked={starUnlocked}
            hasStar={!!equippedStar}
            mode={mode}
            missionLabel={missionLabel}
            isChanging={isChanging}
            onSwitchStar={() => setMode("star")}
          />
        ) : (
          <TorimiaPanel
            colors={colors}
            starName={equippedStar?.displayName ?? "STAR"}
            promoted={promoted}
            canOpen={!!torimia?.canOpen}
            requirements={requirements}
            isOpening={isOpening}
            onOpen={async () => {
              try {
                await openTorimia();
                await refetchTorimia();
                crossAlert("토르미아 개방", "토르미아의 문이 열렸어요. 이제 공식 STAR로 승급했어요.");
              } catch {
                crossAlert("아직 부족해요", "토르미아 조건을 모두 채운 뒤 다시 시도해 주세요.");
              }
            }}
          />
        )}

        {missionReady && activeQuest ? (
          <Pressable
            disabled
            accessibilityState={{ disabled: true }}
            accessibilityLabel="진행 중인 성장 RPG 준비 중"
          >
            <LinearGradient
              colors={(isDark ? gradientsDark : gradients).soft}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaCard}
            >
              <View style={[styles.ctaIcon, { backgroundColor: isDark ? "#3A2618" : "#FFF0E1" }]}>
                <Feather name={themeMeta(activeQuest.theme, promoted).icon} size={24} color="#FB923C" />
              </View>
              <View style={styles.ctaBody}>
                <Text style={[styles.ctaLabel, { color: colors.mutedForeground }]}>{missionLabel} 이어서 하기</Text>
                <Text style={[styles.ctaTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {activeQuest.title}
                </Text>
                <Text style={[styles.ctaSub, { color: colors.mutedForeground }]}>
                  {Math.min(activeQuest.currentStageIndex + 1, activeQuest.stages.length)} /{" "}
                  {activeQuest.stages.length} 단계
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
            </LinearGradient>
          </Pressable>
        ) : null}

        <Pressable
          disabled
          accessibilityState={{ disabled: true }}
          style={[
            styles.randomBtn,
            { backgroundColor: colors.primary, opacity: 0.55 },
          ]}
        >
          {starting === "random" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="shuffle" size={18} color="#fff" />
              <Text style={styles.randomBtnText}>랜덤 {missionLabel} 시작</Text>
            </>
          )}
        </Pressable>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{missionLabel} 테마</Text>
        <View style={styles.grid}>
          {themeOptions.map((t) => {
            const loading = starting === t.key;
            return (
              <Pressable
                key={t.key}
                disabled
                accessibilityState={{ disabled: true }}
                style={[
                  styles.themeCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: 0.6,
                  },
                ]}
              >
                <View style={[styles.themeIcon, { backgroundColor: t.color + "22" }]}>
                  {loading ? (
                    <ActivityIndicator color={t.color} />
                  ) : (
                    <Feather name={t.icon} size={20} color={t.color} />
                  )}
                </View>
                <Text style={[styles.themeLabel, { color: colors.foreground }]}>{t.label}</Text>
                <Text style={[styles.themeDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {t.desc}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </CustomScrollView>
    </View>
  );
}

function MissionGate({
  colors,
  starUnlocked,
  hasStar,
  mode,
  missionLabel,
  isChanging,
  onSwitchStar,
}: {
  colors: ReturnType<typeof useColors>;
  starUnlocked: boolean;
  hasStar: boolean;
  mode: "fan" | "star";
  missionLabel: string;
  isChanging: boolean;
  onSwitchStar: () => void;
}) {
  const title = !starUnlocked || !hasStar ? "STAR NFT 장착이 필요해요" : "STAR 모드로 전환해 주세요";
  const body = !starUnlocked || !hasStar
    ? "미션은 STAR 캐릭터가 자신의 꿈을 키우는 공간이에요. 마이페이지에서 지갑 인증과 NFT 장착을 먼저 완료해 주세요."
    : `현재 FAN 모드입니다. ${missionLabel}은 STAR 모드에서만 진행할 수 있어요.`;

  return (
    <View style={[styles.gateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.gateIcon, { backgroundColor: colors.primary + "18" }]}>
        <Feather name="lock" size={22} color={colors.primary} />
      </View>
      <Text style={[styles.gateTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.gateBody, { color: colors.mutedForeground }]}>{body}</Text>
      {starUnlocked && hasStar && mode !== "star" ? (
        <Pressable
          disabled
          accessibilityState={{ disabled: true }}
          style={[styles.gateButton, { backgroundColor: colors.primary, opacity: 0.55 }]}
        >
          {isChanging ? <ActivityIndicator color="#fff" /> : <Text style={styles.gateButtonText}>STAR 모드로 전환</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

function TorimiaPanel({
  colors,
  starName,
  promoted,
  canOpen,
  requirements,
  isOpening,
  onOpen,
}: {
  colors: ReturnType<typeof useColors>;
  starName: string;
  promoted: boolean;
  canOpen: boolean;
  requirements: TorimiaRequirement[];
  isOpening: boolean;
  onOpen: () => void;
}) {
  return (
    <View style={[styles.torimiaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.torimiaHeader}>
        <View style={[styles.torimiaIcon, { backgroundColor: "#8B5CF622" }]}>
          <Feather name={promoted ? "star" : "sunrise"} size={22} color="#8B5CF6" />
        </View>
        <View style={styles.torimiaTitleWrap}>
          <Text style={[styles.torimiaLabel, { color: colors.mutedForeground }]}>토르미아 시스템</Text>
          <Text style={[styles.torimiaTitle, { color: colors.foreground }]}>
            {promoted ? `${starName} 성장 단계가 열렸어요` : `${starName} 성장 RPG를 시작해보세요`}
          </Text>
        </View>
      </View>
      <Text style={[styles.torimiaBody, { color: colors.mutedForeground }]}>
        {promoted
          ? "팬들과 함께 장착한 IP의 세계관을 확장하고 캐릭터를 성장시켜 보세요."
          : "성장 RPG 미션을 완료하면 장착한 NFT 캐릭터의 레벨과 스탯이 올라갑니다."}
      </Text>
      {requirements.length > 0 ? (
        <View style={styles.requirementList}>
          {requirements.map((req) => (
            <View key={req.key} style={styles.requirementRow}>
              <Feather
                name={req.met ? "check-circle" : "circle"}
                size={16}
                color={req.met ? "#10B981" : colors.mutedForeground}
              />
              <Text style={[styles.requirementText, { color: colors.foreground }]}>
                {req.label} {Math.min(req.current, req.target)} / {req.target}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {!promoted ? (
        <Pressable
          disabled
          accessibilityState={{ disabled: true }}
          style={[
            styles.torimiaButton,
            { backgroundColor: canOpen ? "#8B5CF6" : colors.border, opacity: 0.55 },
          ]}
        >
          {isOpening ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.torimiaButtonText, { color: canOpen ? "#fff" : colors.mutedForeground }]}>
              토르미아 문 열기
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  brand: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  intro: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, marginTop: 4, marginBottom: 14 },
  identityHint: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: -8, marginBottom: 12 },
  rpgContentCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 9, marginBottom: 14 },
  rpgContentTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  rpgContentBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  rpgMissionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rpgMissionText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  gateCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  gateIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  gateTitle: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  gateBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, textAlign: "center" },
  gateButton: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  gateButtonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  torimiaCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
    marginBottom: 14,
  },
  torimiaHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  torimiaIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  torimiaTitleWrap: { flex: 1, gap: 2 },
  torimiaLabel: { fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  torimiaTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  torimiaBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  requirementList: { gap: 8 },
  requirementRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  requirementText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  torimiaButton: { minHeight: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  torimiaButtonText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  ctaCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, padding: 16, marginBottom: 14 },
  ctaIcon: { width: 52, height: 52, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  ctaBody: { flex: 1, gap: 2 },
  ctaLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  ctaTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  ctaSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  randomBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 14,
  },
  randomBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 26, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  themeCard: {
    width: "48%",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  themeIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  themeLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  themeDesc: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
