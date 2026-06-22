import { CustomFlatList } from "@/components/CustomScroll";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetRoomQueryKey,
  getListRoomsQueryKey,
  getFetchRoomMessagesQueryKey,
  useGetRoom,
  useInviteRoomMembers,
  useListFriends,
} from "@workspace/api-client-react";
import { crossAlert } from "@/lib/crossAlert";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";

export default function InviteGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: friends = [] } = useListFriends();
  const { data: room } = useGetRoom(id);
  const invite = useInviteRoomMembers();

  const [selected, setSelected] = useState<string[]>([]);

  // Friends who aren't already in the room are the only valid invitees.
  const existingIds = useMemo(
    () => new Set((room?.members as { id: string }[] | undefined)?.map((m) => m.id) ?? []),
    [room],
  );
  const invitable = useMemo(
    () => friends.filter((f) => !existingIds.has(f.id)),
    [friends, existingIds],
  );

  const toggle = (uid: string) => {
    setSelected((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid],
    );
  };

  const handleInvite = async () => {
    if (selected.length < 1) {
      crossAlert("초대할 친구를 선택해주세요");
      return;
    }
    try {
      await invite.mutateAsync({ id, data: { memberIds: selected } });
      await queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: getFetchRoomMessagesQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: getListRoomsQueryKey() });
      router.back();
    } catch {
      crossAlert("오류", "초대에 실패했습니다");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        초대할 친구 선택 ({selected.length}명)
      </Text>

      {invitable.length === 0 ? (
        <EmptyState
          icon="users"
          title="초대할 친구가 없습니다"
          subtitle="모든 친구가 이미 참여 중이거나 친구가 없습니다"
        />
      ) : (
        <CustomFlatList
          data={invitable}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          renderItem={({ item }) => {
            const isSelected = selected.includes(item.id);
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => toggle(item.id)}
              >
                <Avatar uri={item.profileImageUrl} name={item.nickname} size={46} />
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, { color: colors.foreground }]}>{item.nickname}</Text>
                  <Text style={[styles.rowEmail, { color: colors.mutedForeground }]}>{item.email}</Text>
                </View>
                <View
                  style={[
                    styles.checkbox,
                    { borderColor: isSelected ? colors.primary : colors.border },
                    isSelected && { backgroundColor: colors.primary },
                  ]}
                >
                  {isSelected && <Feather name="check" size={14} color="#fff" />}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <View
        style={[
          styles.bottomBar,
          { borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 16 },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.inviteBtn,
            {
              backgroundColor: selected.length > 0 ? colors.primary : colors.muted,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={handleInvite}
          disabled={selected.length === 0 || invite.isPending}
        >
          {invite.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              style={[
                styles.inviteBtnText,
                { color: selected.length > 0 ? "#fff" : colors.mutedForeground },
              ]}
            >
              초대하기
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowEmail: { fontSize: 12, fontFamily: "Inter_400Regular" },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  inviteBtn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  inviteBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
