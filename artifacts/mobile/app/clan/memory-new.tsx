import { CustomScrollView } from "@/components/CustomScroll";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetMyClanQueryKey,
  useCreateClanMemory,
  useGetMyClan,
} from "@workspace/api-client-react";
import type { ClanMemoryMemoryType } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { crossAlert } from "@/lib/crossAlert";
import {
  MEMORY_TYPE_HINT,
  MEMORY_TYPE_LABEL,
  MEMORY_TYPE_TONE,
} from "@/lib/clanMemory";

const TITLE_MAX = 80;
const SUMMARY_MAX = 1000;
const TAG_MAX = 20;
const TAGS_MAX = 5;

const TYPES: ClanMemoryMemoryType[] = [
  "strategy",
  "lesson",
  "value",
  "achievement",
  "warning",
];

export default function ClanMemoryNewScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ clanId?: string }>();

  const { data: myClan } = useGetMyClan();
  const clanId = params.clanId ?? myClan?.clan.id ?? "";

  const [memoryType, setMemoryType] = React.useState<ClanMemoryMemoryType>("strategy");
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [tagInput, setTagInput] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);

  const create = useCreateClanMemory();

  const trimmedTitle = title.trim();
  const trimmedSummary = summary.trim();
  const canSubmit =
    trimmedTitle.length > 0 && trimmedSummary.length > 0 && !!clanId && !create.isPending;

  const addTag = () => {
    const t = tagInput.trim().replace(/^#+/, "").slice(0, TAG_MAX);
    if (!t) return;
    if (tags.length >= TAGS_MAX) {
      crossAlert("확인", `태그는 최대 ${TAGS_MAX}개까지 추가할 수 있어요.`);
      return;
    }
    if (tags.includes(t)) {
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, t]);
    setTagInput("");
  };

  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const onSubmit = async () => {
    if (!trimmedTitle || !trimmedSummary) {
      crossAlert("확인", "제목과 내용을 입력해 주세요.");
      return;
    }
    try {
      await create.mutateAsync({
        id: clanId,
        data: {
          memoryType,
          title: trimmedTitle,
          summary: trimmedSummary,
          tags: tags.length > 0 ? tags : undefined,
          sourceType: "manual",
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/clans", clanId, "memories"] }),
        queryClient.invalidateQueries({ queryKey: getGetMyClanQueryKey() }),
      ]);
      router.back();
    } catch {
      crossAlert("오류", "가문 기억을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <CustomScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
      >
        <Field label="유형" required colors={colors}>
          <View style={styles.typeRow}>
            {TYPES.map((t) => {
              const active = memoryType === t;
              const tone = MEMORY_TYPE_TONE[t];
              return (
                <Pressable
                  key={t}
                  onPress={() => setMemoryType(t)}
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor: active ? `${tone}1f` : colors.background,
                      borderColor: active ? tone : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      { color: active ? tone : colors.mutedForeground },
                    ]}
                  >
                    {MEMORY_TYPE_LABEL[t]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.typeHint, { color: colors.mutedForeground }]}>
            {MEMORY_TYPE_HINT[memoryType]}
          </Text>
        </Field>

        <Field
          label="제목"
          required
          colors={colors}
          hint={`${trimmedTitle.length}/${TITLE_MAX}`}
        >
          <TextInput
            value={title}
            onChangeText={(t) => setTitle(t.slice(0, TITLE_MAX))}
            placeholder="예) 끝까지 침착함을 유지하라"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
            ]}
          />
        </Field>

        <Field
          label="내용"
          required
          colors={colors}
          hint={`${summary.length}/${SUMMARY_MAX}`}
        >
          <TextInput
            value={summary}
            onChangeText={(t) => setSummary(t.slice(0, SUMMARY_MAX))}
            placeholder="가문에 남기고 싶은 교훈이나 전략을 적어 주세요."
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[
              styles.input,
              styles.multiline,
              { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
            ]}
          />
        </Field>

        <Field label="태그" colors={colors} hint={`${tags.length}/${TAGS_MAX}`}>
          <View style={styles.tagInputRow}>
            <TextInput
              value={tagInput}
              onChangeText={(t) => setTagInput(t.slice(0, TAG_MAX))}
              onSubmitEditing={addTag}
              returnKeyType="done"
              placeholder="태그 입력 후 추가"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.input,
                { flex: 1, color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
              ]}
            />
            <Pressable
              onPress={addTag}
              style={[styles.addTagBtn, { backgroundColor: colors.foreground }]}
            >
              <Feather name="plus" size={16} color={colors.background} />
            </Pressable>
          </View>
          {tags.length > 0 ? (
            <View style={styles.tagRow}>
              {tags.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => removeTag(t)}
                  style={[styles.tag, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <Text style={[styles.tagText, { color: colors.foreground }]}>#{t}</Text>
                  <Feather name="x" size={12} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </Field>

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={[
            styles.submitBtn,
            { backgroundColor: canSubmit ? colors.primary : colors.border },
          ]}
        >
          <Text style={styles.submitText}>
            {create.isPending ? "저장 중..." : "가문 기억 남기기"}
          </Text>
        </Pressable>
      </CustomScrollView>
    </View>
  );
}

function Field({
  label,
  required,
  hint,
  colors,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
          {label}
          {required ? <Text style={{ color: colors.destructive }}> *</Text> : null}
        </Text>
        {hint ? (
          <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>{hint}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  field: { marginBottom: 18 },
  fieldHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  fieldLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fieldHint: { fontSize: 12, fontFamily: "Inter_400Regular" },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  multiline: { minHeight: 120, textAlignVertical: "top" },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  typeHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 8 },
  tagInputRow: { flexDirection: "row", gap: 8 },
  addTagBtn: {
    width: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  submitBtn: {
    marginTop: 8,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
