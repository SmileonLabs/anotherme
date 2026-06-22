import { CustomFlatList } from "@/components/CustomScroll";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useListBattlePersonas, useListFriends } from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { useColors } from "@/hooks/useColors";

type Mode = "ai" | "friend";

export default function BattleCreateScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: friends = [] } = useListFriends();
  const { data: personaData } = useListBattlePersonas();
  const personas = personaData?.personas ?? [];

  const params = useLocalSearchParams<{ mode?: string; random?: string }>();
  // Mode is fixed by the entry point (AI vs friend dashboard card) — no toggle.
  const mode: Mode = params.mode === "friend" ? "friend" : "ai";
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const isRandom = params.random === "1";

  const canNext = mode === "ai" ? !!selectedPersona : !!selectedFriend;

  const handleNext = () => {
    if (mode === "ai") {
      if (!selectedPersona) return;
      router.push({
        pathname: "/battle/topic",
        params: { aiPersonaId: selectedPersona, ...(isRandom ? { random: "1" } : {}) },
      });
    } else {
      if (!selectedFriend) return;
      router.push({
        pathname: "/battle/topic",
        params: { memberId: selectedFriend, ...(isRandom ? { random: "1" } : {}) },
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.intro, { backgroundColor: colors.accent }]}>
        <Text style={styles.introEmoji}>⚔️</Text>
        <Text style={[styles.introText, { color: colors.foreground }]}>
          찬반으로 나뉘어 3라운드 말싸움! AI 심판이 매 발언을 채점해 승자를 가립니다.
        </Text>
      </View>

      {mode === "ai" ? (
        <>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            대결할 AI 캐릭터를 선택하세요
          </Text>
          <CustomFlatList
            data={personas}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
            ListEmptyComponent={
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                캐릭터를 불러오는 중...
              </Text>
            }
            renderItem={({ item }) => {
              const isSelected = selectedPersona === item.id;
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.personaCard,
                    {
                      borderColor: isSelected ? colors.primary : colors.border,
                      backgroundColor: isSelected ? colors.accent : colors.background,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                  onPress={() => setSelectedPersona(isSelected ? null : item.id)}
                >
                  <Text style={styles.personaEmoji}>{item.emoji}</Text>
                  <Text style={[styles.personaName, { color: colors.foreground }]}>{item.name}</Text>
                  <Text
                    style={[styles.personaTagline, { color: colors.mutedForeground }]}
                    numberOfLines={2}
                  >
                    {item.tagline}
                  </Text>
                </Pressable>
              );
            }}
          />
        </>
      ) : (
        <>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            상대로 초대할 친구 1명을 선택하세요
          </Text>
          <CustomFlatList
            data={friends}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
            ListEmptyComponent={
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                친구를 먼저 추가하면 토크배틀에 초대할 수 있어요.
              </Text>
            }
            renderItem={({ item }) => {
              const isSelected = selectedFriend === item.id;
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={() => setSelectedFriend(isSelected ? null : item.id)}
                >
                  <Avatar uri={item.profileImageUrl} name={item.nickname} size={46} />
                  <View style={styles.rowInfo}>
                    <Text style={[styles.rowName, { color: colors.foreground }]}>{item.nickname}</Text>
                    <Text style={[styles.rowEmail, { color: colors.mutedForeground }]}>{item.email}</Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
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
        </>
      )}

      <View
        style={[
          styles.bottomBar,
          { borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 16 },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.nextBtn,
            {
              backgroundColor: canNext ? colors.primary : colors.muted,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={handleNext}
          disabled={!canNext}
        >
          <Text
            style={[
              styles.nextBtnText,
              { color: canNext ? "#fff" : colors.mutedForeground },
            ]}
          >
            주제 정하기 →
          </Text>
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
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 16, paddingTop: 8 },
  gridRow: { gap: 12 },
  personaCard: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: "center",
    gap: 6,
    minHeight: 130,
  },
  personaEmoji: { fontSize: 36 },
  personaName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  personaTagline: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 16 },
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
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  nextBtn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  nextBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
