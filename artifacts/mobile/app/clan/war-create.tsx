import { CustomScrollView } from "@/components/CustomScroll";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListClanWarsQueryKey,
  useCreateClanWar,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { crossAlert } from "@/lib/crossAlert";

const TOPIC_MAX = 120;

export default function ClanWarCreateScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [topic, setTopic] = React.useState("");
  const create = useCreateClanWar();

  const trimmed = topic.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= TOPIC_MAX;
  const canSubmit = valid && !create.isPending;

  const onSubmit = async () => {
    if (!valid) {
      crossAlert("확인", "주제는 2~120자로 입력해 주세요.");
      return;
    }
    try {
      const war = await create.mutateAsync({ data: { topic: trimmed } });
      await queryClient.invalidateQueries({ queryKey: getListClanWarsQueryKey() });
      router.replace({ pathname: "/clan/war/[id]", params: { id: war.id } });
    } catch (err) {
      const message =
        (err as { message?: string })?.message ??
        "가문전을 만들지 못했어요. 잠시 후 다시 시도해 주세요.";
      crossAlert("오류", message);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <CustomScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        <View style={[styles.notice, { backgroundColor: `${colors.primary}12` }]}>
          <Feather name="info" size={15} color={colors.primary} />
          <Text style={[styles.noticeText, { color: colors.primary }]}>
            공개 도전으로 등록돼요. 다른 가문의 가문장·원로가 수락하면 시작됩니다.
          </Text>
        </View>

        <View style={styles.fieldHead}>
          <Text style={[styles.label, { color: colors.foreground }]}>
            토론 주제 <Text style={{ color: colors.destructive }}>*</Text>
          </Text>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            {trimmed.length}/{TOPIC_MAX}
          </Text>
        </View>
        <TextInput
          value={topic}
          onChangeText={(t) => setTopic(t.slice(0, TOPIC_MAX))}
          placeholder="예) 재택근무가 생산성을 높인다"
          placeholderTextColor={colors.mutedForeground}
          multiline
          style={[
            styles.input,
            { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
          ]}
        />

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={[styles.submitBtn, { backgroundColor: canSubmit ? colors.primary : colors.border }]}
        >
          <Text style={styles.submitText}>
            {create.isPending ? "만드는 중..." : "도전장 등록"}
          </Text>
        </Pressable>
      </CustomScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  notice: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  noticeText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 19 },
  fieldHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 100,
    textAlignVertical: "top",
  },
  submitBtn: { marginTop: 24, paddingVertical: 15, borderRadius: 12, alignItems: "center" },
  submitText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
