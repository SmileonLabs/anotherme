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
import { useCreateDungeon, useListFriends } from "@workspace/api-client-react";
import { crossAlert } from "@/lib/crossAlert";
import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";

export default function CreateDungeonScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: friends = [] } = useListFriends();
  const createDungeon = useCreateDungeon();

  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCreate = async () => {
    if (createDungeon.isPending) return;
    try {
      const room = await createDungeon.mutateAsync({
        data: {
          name: name.trim() || "던전 탐험",
          memberIds: selected,
          theme: "fantasy",
        },
      });
      router.replace({ pathname: "/chat/[id]", params: { id: room.id } });
    } catch {
      crossAlert("오류", "던전을 생성하지 못했습니다");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.intro, { backgroundColor: colors.accent }]}>
        <Text style={styles.introEmoji}>🐉</Text>
        <Text style={[styles.introText, { color: colors.foreground }]}>
          AI 던전 마스터가 정통 판타지 모험을 진행합니다. 동료를 모아 던전에 도전하세요.
        </Text>
      </View>

      <View style={[styles.nameRow, { borderBottomColor: colors.border }]}>
        <TextInput
          style={[styles.nameInput, { color: colors.foreground }]}
          value={name}
          onChangeText={setName}
          placeholder="던전 이름 (예: 잊혀진 지하 미궁)"
          placeholderTextColor={colors.mutedForeground}
          maxLength={50}
        />
      </View>

      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        함께할 동료 선택 ({selected.length}명) · 선택 안 하면 혼자 모험
      </Text>

      <CustomFlatList
        data={friends}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        ListEmptyComponent={
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            친구를 추가하면 함께 파티 플레이를 할 수 있어요.
          </Text>
        }
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

      <View
        style={[
          styles.bottomBar,
          { borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 16 },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.createBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={handleCreate}
          disabled={createDungeon.isPending}
        >
          {createDungeon.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createBtnText}>⚔️ 모험 시작</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  intro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
  },
  introEmoji: { fontSize: 26 },
  introText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 19 },
  nameRow: { paddingHorizontal: 16, paddingVertical: 12, marginTop: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  nameInput: { fontSize: 16, fontFamily: "Inter_500Medium", height: 44 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 16, paddingTop: 8 },
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
  createBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
