import { CustomFlatList } from "@/components/CustomScroll";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCreateRoom, useListFriends } from "@workspace/api-client-react";
import { crossAlert } from "@/lib/crossAlert";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";

export default function CreateGroupScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: friends = [] } = useListFriends();
  const createRoom = useCreateRoom();

  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      crossAlert("그룹 이름을 입력해주세요");
      return;
    }
    if (selected.length < 1) {
      crossAlert("최소 1명의 친구를 선택해주세요");
      return;
    }
    try {
      const room = await createRoom.mutateAsync({
        data: { type: "group", name: groupName.trim(), memberIds: selected },
      });
      router.replace({ pathname: "/chat/[id]", params: { id: room.id } });
    } catch {
      crossAlert("오류", "그룹 채팅 생성에 실패했습니다");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.nameRow, { borderBottomColor: colors.border }]}>
        <TextInput
          style={[styles.nameInput, { color: colors.foreground }]}
          value={groupName}
          onChangeText={setGroupName}
          placeholder="그룹 이름 입력"
          placeholderTextColor={colors.mutedForeground}
          maxLength={50}
        />
      </View>

      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        친구 선택 ({selected.length}명)
      </Text>

      {friends.length === 0 ? (
        <EmptyState icon="users" title="친구가 없습니다" subtitle="먼저 친구를 추가해주세요" />
      ) : (
        <CustomFlatList
          data={friends}
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

      <View style={[styles.bottomBar, { borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }]}>
        <Pressable
          style={({ pressed }) => [
            styles.createBtn,
            {
              backgroundColor: groupName.trim() && selected.length > 0 ? colors.primary : colors.muted,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={handleCreate}
          disabled={!groupName.trim() || selected.length === 0 || createRoom.isPending}
        >
          {createRoom.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              style={[
                styles.createBtnText,
                { color: groupName.trim() && selected.length > 0 ? "#fff" : colors.mutedForeground },
              ]}
            >
              그룹 만들기
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  nameRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  nameInput: { fontSize: 16, fontFamily: "Inter_500Medium", height: 44 },
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
  createBtn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  createBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
