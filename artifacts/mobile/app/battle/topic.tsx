import { CustomScrollView } from "@/components/CustomScroll";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCreateBattle, useSuggestBattleTopics } from "@workspace/api-client-react";
import { crossAlert } from "@/lib/crossAlert";
import { useColors } from "@/hooks/useColors";

const CATEGORIES = ["음식", "연애", "일상", "직장", "취향", "엉뚱한"];

export default function BattleTopicScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { memberId, aiPersonaId, random } = useLocalSearchParams<{
    memberId?: string;
    aiPersonaId?: string;
    random?: string;
  }>();

  const suggest = useSuggestBattleTopics();
  const createBattle = useCreateBattle();

  const [category, setCategory] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [topic, setTopic] = useState("");

  const handleSuggest = async (cat: string) => {
    setCategory(cat);
    if (suggest.isPending) return;
    try {
      const res = await suggest.mutateAsync({ data: { category: cat } });
      setSuggestions(res.topics ?? []);
    } catch {
      crossAlert("오류", "주제를 불러오지 못했습니다");
    }
  };

  // Random-topic flow: on mount, pick a random category, fetch AI suggestions,
  // and auto-select a random one so the user lands on a ready-to-go debate topic.
  const didRandom = React.useRef(false);
  React.useEffect(() => {
    if (random !== "1" || didRandom.current) return;
    didRandom.current = true;
    const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    setCategory(cat);
    (async () => {
      try {
        const res = await suggest.mutateAsync({ data: { category: cat } });
        const topics = res.topics ?? [];
        setSuggestions(topics);
        if (topics.length > 0) {
          setTopic(topics[Math.floor(Math.random() * topics.length)]);
        }
      } catch {
        crossAlert("오류", "랜덤 주제를 불러오지 못했습니다");
      }
    })();
  }, [random, suggest]);

  const handleCreate = async () => {
    const chosen = topic.trim();
    if (!chosen || (!memberId && !aiPersonaId) || createBattle.isPending) return;
    try {
      const room = await createBattle.mutateAsync({
        data: aiPersonaId
          ? { aiPersonaId, category, topic: chosen }
          : { memberId, category, topic: chosen },
      });
      router.replace({ pathname: "/battle/[id]", params: { id: room.id } });
    } catch {
      crossAlert("오류", "토크배틀을 만들지 못했습니다");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CustomScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>카테고리</Text>
        <View style={styles.chipWrap}>
          {CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => handleSuggest(cat)}
                style={[
                  styles.chip,
                  { backgroundColor: active ? colors.primary : colors.muted },
                ]}
              >
                <Text
                  style={[styles.chipText, { color: active ? "#fff" : colors.mutedForeground }]}
                >
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.suggestHeader}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            AI 추천 주제
          </Text>
          {suggest.isPending && <ActivityIndicator size="small" color={colors.primary} />}
        </View>

        {suggestions.length === 0 && !suggest.isPending ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            카테고리를 누르면 AI가 토론 주제를 추천해줘요.
          </Text>
        ) : (
          suggestions.map((s) => {
            const active = topic === s;
            return (
              <Pressable
                key={s}
                onPress={() => setTopic(s)}
                style={[
                  styles.suggestRow,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.accent : "transparent",
                  },
                ]}
              >
                <Text style={[styles.suggestText, { color: colors.foreground }]}>{s}</Text>
              </Pressable>
            );
          })
        )}

        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 20 }]}>
          직접 주제 입력 / 수정
        </Text>
        <TextInput
          style={[
            styles.input,
            { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.muted },
          ]}
          value={topic}
          onChangeText={setTopic}
          placeholder="예: 탕수육은 부먹이 옳다"
          placeholderTextColor={colors.mutedForeground}
          maxLength={200}
          multiline
        />
      </CustomScrollView>

      <View
        style={[
          styles.bottomBar,
          { borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 16 },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.createBtn,
            {
              backgroundColor: topic.trim() ? colors.primary : colors.muted,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={handleCreate}
          disabled={!topic.trim() || createBattle.isPending}
        >
          {createBattle.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              style={[
                styles.createBtnText,
                { color: topic.trim() ? "#fff" : colors.mutedForeground },
              ]}
            >
              ⚔️ 대기방 만들기
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
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  chipText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  suggestHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 16 },
  suggestRow: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  suggestText: { fontSize: 15, fontFamily: "Inter_500Medium", lineHeight: 21 },
  input: {
    marginHorizontal: 16,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlignVertical: "top",
  },
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  createBtn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  createBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
