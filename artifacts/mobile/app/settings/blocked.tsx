import { CustomFlatList } from "@/components/CustomScroll";
import React from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useListBlocked, useUnblockUser } from "@workspace/api-client-react";
import { crossAlert } from "@/lib/crossAlert";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";

export default function BlockedScreen() {
  const colors = useColors();
  const { data: blocked = [], refetch, isRefetching } = useListBlocked();
  const unblock = useUnblockUser();

  const handleUnblock = (userId: string, nickname: string) => {
    crossAlert("차단 해제", `${nickname}님의 차단을 해제하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      {
        text: "차단 해제",
        onPress: async () => {
          await unblock.mutateAsync({ userId });
          refetch();
        },
      },
    ]);
  };

  return (
    <CustomFlatList
      data={blocked}
      keyExtractor={(item) => item.id}
      contentContainerStyle={blocked.length === 0 ? styles.emptyContainer : styles.list}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
      }
      ListEmptyComponent={
        <EmptyState icon="slash" title="차단한 사용자가 없습니다" />
      }
      renderItem={({ item }) => (
        <View style={[styles.row, { borderBottomColor: colors.border }]}>
          <Avatar uri={item.profileImageUrl} name={item.nickname} size={46} />
          <View style={styles.info}>
            <Text style={[styles.name, { color: colors.foreground }]}>{item.nickname}</Text>
            <Text style={[styles.email, { color: colors.mutedForeground }]}>{item.email}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.unblockBtn,
              { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => handleUnblock(item.id, item.nickname)}
          >
            <Text style={[styles.unblockText, { color: colors.foreground }]}>차단 해제</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  emptyContainer: { flex: 1, minHeight: 400 },
  list: { paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontFamily: "Inter_500Medium" },
  email: { fontSize: 12, fontFamily: "Inter_400Regular" },
  unblockBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  unblockText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
