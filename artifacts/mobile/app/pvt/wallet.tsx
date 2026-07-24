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
import { CustomScrollView } from "@/components/CustomScroll";
import { useColors } from "@/hooks/useColors";
import { usePvtTransactions, usePvtWallet } from "@/hooks/usePvtWallet";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceLabel(source: string) {
  if (source === "DAILY_TALK_REWARD") return "Talk to Earn";
  if (source === "EVENT") return "이벤트";
  if (source === "MISSION") return "미션";
  return "관리자";
}

export default function PvtWalletScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const wallet = usePvtWallet();
  const transactions = usePvtTransactions();
  const isRefreshing = wallet.isFetching || transactions.isFetching;

  const refresh = async () => {
    await Promise.allSettled([wallet.refetch(), transactions.refetch()]);
  };
  const goBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)" as never);
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
          hitSlop={12}
          onPress={goBack}
          style={({ pressed }) => [
            styles.headerButton,
            pressed && styles.pressed,
          ]}
        >
          <Feather name="arrow-left" size={27} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Star Point
        </Text>
        <View style={styles.headerButton} />
      </View>
      <CustomScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 90,
        }}
      >
        <View
          style={[
            styles.balanceCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: colors.accent }]}>
            <Feather name="database" size={24} color={colors.primary} />
          </View>
          <Text style={[styles.kicker, { color: colors.primary }]}>
            STAR Point
          </Text>
          <Text style={[styles.balance, { color: colors.foreground }]}>
            {(wallet.data?.balance ?? 0).toLocaleString()} STAR Point
          </Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            STAR Point는 현재 앱 내부 포인트입니다. 온체인 전환이나 현금화 기능은
            제공하지 않습니다.
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            거래 내역
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Star Point 내역 새로고침"
            disabled={isRefreshing}
            onPress={() => void refresh()}
            hitSlop={8}
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && styles.pressed,
              isRefreshing && styles.refreshDisabled,
            ]}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather
                name="refresh-cw"
                size={18}
                color={colors.mutedForeground}
              />
            )}
          </Pressable>
        </View>

        {transactions.isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              내역을 불러오는 중이에요.
            </Text>
          </View>
        ) : transactions.isError ? (
          <Pressable
            onPress={() => void transactions.refetch()}
            style={[
              styles.stateBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>
              거래 내역을 불러오지 못했어요
            </Text>
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              눌러서 다시 시도해 주세요.
            </Text>
          </Pressable>
        ) : (transactions.data ?? []).length === 0 ? (
          <View
            style={[
              styles.stateBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>
              아직 STAR Point 내역이 없어요
            </Text>
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              오늘의 톡 리워드를 받아 첫 STAR Point를 쌓아보세요.
            </Text>
          </View>
        ) : (
          (transactions.data ?? []).map((item) => (
            <View
              key={item.id}
              style={[
                styles.txRow,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.txInfo}>
                <Text style={[styles.txTitle, { color: colors.foreground }]}>
                  {item.description ?? sourceLabel(item.source)}
                </Text>
                <Text
                  style={[styles.txMeta, { color: colors.mutedForeground }]}
                >
                  {sourceLabel(item.source)} · {formatTime(item.createdAt)}
                </Text>
              </View>
              <View style={styles.txAmountBlock}>
                <Text
                  style={[
                    styles.txAmount,
                    {
                      color:
                        item.amount >= 0 ? colors.primary : colors.destructive,
                    },
                  ]}
                >
                  {item.amount >= 0 ? "+" : ""}
                  {item.amount} STAR Point
                </Text>
                <Text
                  style={[styles.txBalance, { color: colors.mutedForeground }]}
                >
                  잔액 {item.balanceAfter}
                </Text>
              </View>
            </View>
          ))
        )}
      </CustomScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 56,
    paddingBottom: 8,
    paddingHorizontal: 10,
  },
  headerButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  pressed: { opacity: 0.65 },
  balanceCard: {
    alignItems: "center",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 22,
  },
  icon: {
    alignItems: "center",
    borderRadius: 20,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  kicker: { fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1.1 },
  balance: { fontFamily: "Inter_700Bold", fontSize: 34, letterSpacing: -1 },
  description: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 20,
  },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  refreshButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  refreshDisabled: { opacity: 0.7 },
  stateBox: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 20,
  },
  stateTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  stateText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
  },
  txRow: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    padding: 14,
  },
  txInfo: { flex: 1, gap: 3 },
  txTitle: { fontFamily: "Inter_700Bold", fontSize: 14 },
  txMeta: { fontFamily: "Inter_400Regular", fontSize: 12 },
  txAmountBlock: { alignItems: "flex-end", gap: 3 },
  txAmount: { fontFamily: "Inter_700Bold", fontSize: 14 },
  txBalance: { fontFamily: "Inter_500Medium", fontSize: 11 },
});
