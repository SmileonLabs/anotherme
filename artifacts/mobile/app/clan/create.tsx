import { CustomScrollView } from "@/components/CustomScroll";
import { useRouter } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetMyClanQueryKey,
  getListClansQueryKey,
  useCreateClan,
} from "@workspace/api-client-react";
import type { ClanCreatePreferredArchetype } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { crossAlert } from "@/lib/crossAlert";

const NAME_MAX = 20;
const DESC_MAX = 300;
const VALUES_MAX = 200;

const ARCHETYPES: { key: ClanCreatePreferredArchetype; label: string }[] = [
  { key: "strategist", label: "전략가형" },
  { key: "harmonizer", label: "조율자형" },
  { key: "explorer", label: "탐험가형" },
  { key: "pioneer", label: "개척자형" },
  { key: "sage", label: "현자형" },
  { key: "entertainer", label: "재담꾼형" },
  { key: "activist", label: "행동가형" },
  { key: "observer", label: "관찰자형" },
];

export default function ClanCreateScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [clanValues, setClanValues] = React.useState("");
  const [archetype, setArchetype] = React.useState<ClanCreatePreferredArchetype | null>(null);

  const create = useCreateClan();
  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= 2 && trimmedName.length <= NAME_MAX;
  const canSubmit = nameValid && !create.isPending;

  const onSubmit = async () => {
    if (!nameValid) {
      crossAlert("확인", "가문 이름은 2~20자로 입력해 주세요.");
      return;
    }
    try {
      await create.mutateAsync({
        data: {
          name: trimmedName,
          description: description.trim() || undefined,
          clanValues: clanValues.trim() || undefined,
          preferredArchetype: archetype ?? undefined,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetMyClanQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListClansQueryKey() }),
      ]);
      router.replace("/clan");
    } catch (err) {
      const message =
        (err as { message?: string })?.message?.includes("이름")
          ? "이미 사용 중인 가문 이름이에요."
          : "가문 생성에 실패했어요. 잠시 후 다시 시도해 주세요.";
      crossAlert("오류", message);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      <CustomScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
      >
        <Field label="가문 이름" required colors={colors} hint={`${trimmedName.length}/${NAME_MAX}`}>
          <TextInput
            value={name}
            onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
            placeholder="예) 논리의 현자들"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
          />
        </Field>

        <Field label="설명" colors={colors} hint={`${description.length}/${DESC_MAX}`}>
          <TextInput
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, DESC_MAX))}
            placeholder="가문을 한두 문장으로 소개해 주세요."
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[styles.input, styles.multiline, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
          />
        </Field>

        <Field label="대표 가치관" colors={colors} hint={`${clanValues.length}/${VALUES_MAX}`}>
          <TextInput
            value={clanValues}
            onChangeText={(t) => setClanValues(t.slice(0, VALUES_MAX))}
            placeholder="예) 끝까지 논리로 설득한다"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
          />
        </Field>

        <Field label="선호 아키타입" colors={colors}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {ARCHETYPES.map((a) => {
              const active = archetype === a.key;
              return (
                <Pressable
                  key={a.key}
                  onPress={() => setArchetype(active ? null : a.key)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? `${colors.primary}18` : colors.background,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? colors.primary : colors.mutedForeground }]}>
                    {a.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Field>

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          style={[styles.submitBtn, { backgroundColor: canSubmit ? colors.primary : colors.border }]}
        >
          <Text style={styles.submitText}>{create.isPending ? "만드는 중..." : "가문 만들기"}</Text>
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
        {hint ? <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  field: { marginBottom: 18 },
  fieldHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
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
  multiline: { minHeight: 90, textAlignVertical: "top" },
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  submitBtn: {
    marginTop: 8,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
