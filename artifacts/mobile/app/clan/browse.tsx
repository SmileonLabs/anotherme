import { CustomScrollView } from "@/components/CustomScroll";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetMyClanQueryKey,
  useListClans,
  useJoinClan,
} from "@workspace/api-client-react";
import type { ClanSummary, ListClansParams } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { crossAlert } from "@/lib/crossAlert";

const ARCHETYPES: { key: string; label: string }[] = [
  { key: "strategist", label: "전략가형" },
  { key: "harmonizer", label: "조율자형" },
  { key: "explorer", label: "탐험가형" },
  { key: "pioneer", label: "개척자형" },
  { key: "sage", label: "현자형" },
  { key: "entertainer", label: "재담꾼형" },
  { key: "activist", label: "행동가형" },
  { key: "observer", label: "관찰자형" },
];
const ARCHETYPE_LABEL: Record<string, string> = Object.fromEntries(
  ARCHETYPES.map((a) => [a.key, a.label]),
);

export default function ClanBrowseScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [archetype, setArchetype] = React.useState<string | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params: ListClansParams = {};
  if (debounced) params.q = debounced;
  if (archetype) params.archetype = archetype as ListClansParams["archetype"];

  const { data, isLoading, isError, refetch } = useListClans(params);
  const join = useJoinClan();
  const [joiningId, setJoiningId] = React.useState<string | null>(null);

  const onJoin = (clan: ClanSummary) => {
    crossAlert("가문 가입", `'${clan.name}' 가문에 가입할까요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "가입",
        onPress: async () => {
          setJoiningId(clan.id);
          try {
            await join.mutateAsync({ id: clan.id });
            await queryClient.invalidateQueries({ queryKey: getGetMyClanQueryKey() });
            router.replace("/clan");
          } catch (err) {
            const msg = (err as { message?: string })?.message?.includes("이미")
              ? "이미 다른 가문에 소속되어 있어요."
              : "가문 가입에 실패했어요.";
            crossAlert("오류", msg);
          } finally {
            setJoiningId(null);
          }
        },
      },
    ]);
  };

  const clans = data ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="가문 이름 검색"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {search ? (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {ARCHETYPES.map((a) => {
          const active = archetype === a.key;
          return (
            <Pressable
              key={a.key}
              onPress={() => setArchetype(active ? null : a.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? `${colors.primary}18` : colors.background,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? colors.primary : colors.mutedForeground }]}>
                {a.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <CustomScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>
              가문 목록을 불러오지 못했어요.
            </Text>
            <Pressable onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : clans.length === 0 ? (
          <View style={styles.center}>
            <Feather name="shield" size={32} color={colors.mutedForeground} />
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>
              {debounced || archetype ? "조건에 맞는 가문이 없어요." : "아직 만들어진 가문이 없어요."}
            </Text>
            <Pressable
              onPress={() => router.push("/clan/create")}
              style={[styles.retryBtn, { backgroundColor: colors.foreground }]}
            >
              <Text style={[styles.retryText, { color: colors.background }]}>가문 만들기</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {clans.map((clan) => (
              <View key={clan.id} style={[styles.card, { backgroundColor: colors.background }]}>
                <View style={[styles.emblem, { backgroundColor: `${colors.primary}14` }]}>
                  <Feather name="shield" size={20} color={colors.primary} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={1}>
                    {clan.name}
                  </Text>
                  <Text style={[styles.cardMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                    Lv.{clan.level} · 멤버 {clan.memberCount}명
                    {clan.preferredArchetype
                      ? ` · ${ARCHETYPE_LABEL[clan.preferredArchetype] ?? clan.preferredArchetype}`
                      : ""}
                  </Text>
                  {clan.description ? (
                    <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
                      {clan.description}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => onJoin(clan)}
                  disabled={joiningId === clan.id}
                  style={[styles.joinBtn, { backgroundColor: colors.primary, opacity: joiningId === clan.id ? 0.6 : 1 }]}
                >
                  <Text style={styles.joinText}>{joiningId === clan.id ? "..." : "가입"}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </CustomScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", padding: 0 },
  filterScroll: { marginTop: 12, maxHeight: 44 },
  filterRow: { gap: 8, paddingHorizontal: 16 },
  chip: {
    paddingHorizontal: 14,
    height: 34,
    justifyContent: "center",
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  center: { paddingTop: 60, alignItems: "center", gap: 14 },
  muted: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  retryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  list: { padding: 16, gap: 10 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16 },
  emblem: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, gap: 3 },
  cardName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardMeta: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cardDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  joinBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  joinText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
