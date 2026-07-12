import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/Avatar";
import { CustomScrollView } from "@/components/CustomScroll";
import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";
import {
  useProfileHistory,
  type ProfileHistoryItem,
} from "@/hooks/useProfileHistory";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function historyTitle(item: ProfileHistoryItem) {
  if (item.kind === "profile_update") return "프로필을 업데이트했습니다";
  if (item.kind === "profile_image") return "프로필 사진을 변경했습니다";
  return "상태 메시지를 변경했습니다";
}

export default function ProfileHistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    data: history = [],
    isLoading,
    isError,
    refetch,
  } = useProfileHistory();

  return (
    <CustomScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
    >
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        프로필 사진과 상태 메시지 변경 기록이 시간순으로 누적됩니다.
      </Text>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            히스토리를 불러오는 중이에요.
          </Text>
        </View>
      ) : isError ? (
        <View
          style={[
            styles.centerBox,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            히스토리를 불러오지 못했어요
          </Text>
          <Text
            style={[styles.retryText, { color: colors.primary }]}
            onPress={() => void refetch()}
          >
            다시 시도
          </Text>
        </View>
      ) : history.length === 0 ? (
        <EmptyState
          icon="clock"
          title="아직 프로필 기록이 없습니다"
          subtitle="프로필 사진이나 상태 메시지를 바꾸면 여기에 쌓입니다"
        />
      ) : (
        <View style={styles.list}>
          {history.map((item) => (
            <View
              key={item.id}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardTop}>
                <View
                  style={[styles.iconWrap, { backgroundColor: colors.accent }]}
                >
                  <Feather
                    name={
                      item.kind === "status_message" ? "message-square" : "user"
                    }
                    size={17}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.cardTitleBlock}>
                  <Text
                    style={[styles.cardTitle, { color: colors.foreground }]}
                  >
                    {historyTitle(item)}
                  </Text>
                  <Text
                    style={[styles.cardDate, { color: colors.mutedForeground }]}
                  >
                    {formatDate(item.createdAt)}
                  </Text>
                </View>
              </View>

              {item.newProfileImageUrl !== null ? (
                <View style={styles.photoRow}>
                  <Avatar
                    uri={item.oldProfileImageUrl}
                    name="이전 프로필"
                    size={46}
                  />
                  <Feather
                    name="arrow-right"
                    size={16}
                    color={colors.mutedForeground}
                  />
                  <Avatar
                    uri={item.newProfileImageUrl}
                    name="새 프로필"
                    size={46}
                  />
                </View>
              ) : item.oldProfileImageUrl !== null ? (
                <View style={styles.photoRow}>
                  <Avatar
                    uri={item.oldProfileImageUrl}
                    name="이전 프로필"
                    size={46}
                  />
                  <Feather
                    name="arrow-right"
                    size={16}
                    color={colors.mutedForeground}
                  />
                  <View
                    style={[
                      styles.clearedAvatar,
                      { backgroundColor: colors.muted },
                    ]}
                  >
                    <Feather
                      name="x"
                      size={18}
                      color={colors.mutedForeground}
                    />
                  </View>
                </View>
              ) : null}

              {item.newStatusMessage !== null ||
              item.oldStatusMessage !== null ? (
                <View
                  style={[styles.statusBox, { backgroundColor: colors.muted }]}
                >
                  <Text
                    style={[
                      styles.statusLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    상태 메시지
                  </Text>
                  <Text
                    style={[styles.statusText, { color: colors.foreground }]}
                  >
                    {item.newStatusMessage || "비움"}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </CustomScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  description: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  centerBox: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 22,
  },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 13 },
  errorTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  retryText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  list: { gap: 12 },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    padding: 14,
  },
  cardTop: { alignItems: "center", flexDirection: "row", gap: 10 },
  iconWrap: {
    alignItems: "center",
    borderRadius: 12,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  cardTitleBlock: { flex: 1, gap: 2 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  cardDate: { fontFamily: "Inter_400Regular", fontSize: 12 },
  photoRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  clearedAvatar: {
    alignItems: "center",
    borderRadius: 23,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  statusBox: { borderRadius: 14, gap: 3, padding: 12 },
  statusLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 20 },
});
