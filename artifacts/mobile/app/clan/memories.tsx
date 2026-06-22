import { CustomScrollView } from "@/components/CustomScroll";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetMyClanQueryKey,
  getListClanMemoriesQueryKey,
  useDeleteClanMemory,
  useGetMe,
  useGetMyClan,
  useListClanMemories,
} from "@workspace/api-client-react";
import type { ClanMemory, ClanMemoryMemoryType } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { crossAlert } from "@/lib/crossAlert";
import {
  MEMORY_TYPE_LABEL,
  MEMORY_TYPE_TONE,
  formatMemoryDate,
} from "@/lib/clanMemory";

type FilterKey = "all" | ClanMemoryMemoryType;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "strategy", label: "전략" },
  { key: "lesson", label: "교훈" },
  { key: "value", label: "가치" },
  { key: "achievement", label: "업적" },
  { key: "warning", label: "경고" },
];

export default function ClanMemoriesScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ clanId?: string }>();

  const { data: myClan } = useGetMyClan();
  const { data: me } = useGetMe();
  const clanId = params.clanId ?? myClan?.clan.id ?? "";
  const myRole = myClan?.myRole;
  const myUserId = me?.id;

  const [filter, setFilter] = React.useState<FilterKey>("all");

  const queryParams = filter === "all" ? { limit: 100 } : { type: filter, limit: 100 };
  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useListClanMemories(clanId, queryParams, {
    query: {
      enabled: !!clanId,
      queryKey: getListClanMemoriesQueryKey(clanId, queryParams),
    },
  });

  const del = useDeleteClanMemory();

  const canDelete = React.useCallback(
    (memory: ClanMemory) => {
      if (memory.createdByUserId && memory.createdByUserId === myUserId) return true;
      return myRole === "owner" || myRole === "elder";
    },
    [myRole, myUserId],
  );

  const onDelete = (memory: ClanMemory) => {
    crossAlert("가문 기억 삭제", `"${memory.title}"을(를) 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await del.mutateAsync({ id: clanId, memoryId: memory.id });
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["/api/clans", clanId, "memories"] }),
              queryClient.invalidateQueries({ queryKey: getGetMyClanQueryKey() }),
            ]);
            await refetch();
          } catch {
            crossAlert("오류", "가문 기억 삭제에 실패했어요.");
          }
        },
      },
    ]);
  };

  const items = data?.items ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <View style={styles.filterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.foreground : colors.background,
                    borderColor: active ? colors.foreground : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    { color: active ? colors.background : colors.mutedForeground },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <CustomScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96 }}
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
              가문 기억을 불러오지 못했어요.
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Feather name="book-open" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {filter === "all"
                ? "아직 가문 기억이 없습니다."
                : "이 유형의 가문 기억이 없습니다."}
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              전투와 던전에서 얻은 교훈을 가문의 기억으로 남겨보세요.
            </Text>
            {clanId ? (
              <Pressable
                onPress={() => router.push({ pathname: "/clan/memory-new", params: { clanId } })}
                style={({ pressed }) => [
                  styles.emptyCta,
                  { backgroundColor: colors.foreground, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Feather name="edit-3" size={14} color={colors.background} />
                <Text style={[styles.emptyCtaText, { color: colors.background }]}>기억 남기기</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {items.map((m) => (
              <MemoryCard
                key={m.id}
                memory={m}
                colors={colors}
                canDelete={canDelete(m)}
                onDelete={() => onDelete(m)}
                deleting={del.isPending}
              />
            ))}
          </View>
        )}
        {isRefetching ? (
          <ActivityIndicator
            color={colors.primary}
            style={{ marginTop: 16 }}
          />
        ) : null}
      </CustomScrollView>

      <Pressable
        onPress={() =>
          router.push({ pathname: "/clan/memory-new", params: { clanId } })
        }
        style={[
          styles.fab,
          { backgroundColor: colors.primary, bottom: insets.bottom + 20 },
        ]}
      >
        <Feather name="plus" size={18} color="#fff" />
        <Text style={styles.fabText}>기억 남기기</Text>
      </Pressable>
    </View>
  );
}

function MemoryCard({
  memory,
  colors,
  canDelete,
  onDelete,
  deleting,
}: {
  memory: ClanMemory;
  colors: ReturnType<typeof useColors>;
  canDelete: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const tone = MEMORY_TYPE_TONE[memory.memoryType] ?? colors.primary;
  return (
    <View style={[styles.card, { backgroundColor: colors.background }]}>
      <View style={styles.cardHead}>
        <View style={[styles.badge, { backgroundColor: `${tone}1f` }]}>
          <Text style={[styles.badgeText, { color: tone }]}>
            {MEMORY_TYPE_LABEL[memory.memoryType] ?? memory.memoryType}
          </Text>
        </View>
        {canDelete ? (
          <Pressable
            onPress={onDelete}
            disabled={deleting}
            hitSlop={8}
            style={styles.deleteBtn}
          >
            <Feather name="trash-2" size={15} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.cardTitle, { color: colors.foreground }]}>
        {memory.title}
      </Text>
      <Text style={[styles.cardSummary, { color: colors.mutedForeground }]}>
        {memory.summary}
      </Text>

      {memory.tags.length > 0 ? (
        <View style={styles.tagRow}>
          {memory.tags.map((t) => (
            <View key={t} style={[styles.tag, { backgroundColor: colors.muted }]}>
              <Text style={[styles.tagText, { color: colors.mutedForeground }]}>
                #{t}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.cardFoot}>
        <Text style={[styles.footMeta, { color: colors.mutedForeground }]}>
          {memory.authorName ?? "알 수 없음"}
        </Text>
        <Text style={[styles.footMeta, { color: colors.mutedForeground }]}>
          {formatMemoryDate(memory.createdAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { paddingTop: 60, alignItems: "center", gap: 12, paddingHorizontal: 24 },
  bodyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  emptyCtaText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  emptySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
  },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  retryText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },

  filterWrap: { paddingTop: 12 },
  filterRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  filterText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  card: { borderRadius: 16, padding: 16, gap: 8 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  deleteBtn: { padding: 2 },
  cardTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  cardSummary: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  tagText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  cardFoot: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  footMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },

  fab: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
});
