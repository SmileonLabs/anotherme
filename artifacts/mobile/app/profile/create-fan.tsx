import CreateFanAvatarScreen from "@/components/CreateFanAvatarScreen";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NeonBackdrop } from "@/components/NeonUI";
import { useCharacterProfiles } from "@/hooks/useCharacterProfiles";
import { crossAlert } from "@/lib/crossAlert";

const ONBOARDING_KEY = "anotherme.onboarding.v1";

const OPTIONS = {
  ageStyle: ["키즈", "틴", "어덜트"], hairStyle: ["몽글", "웨이브", "숏", "내추럴"],
  skinTone: ["라이트", "미디엄", "딥", "판타지"], genderExpression: ["뉴트럴", "소프트", "볼드"],
} as const;

export default CreateFanAvatarScreen;

function LegacyCreateFanProfileScreen() {
  const router = useRouter(); const insets = useSafeAreaInsets();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const { fanProfiles, createFanProfile, isCreatingFan } = useCharacterProfiles();
  const [displayName, setDisplayName] = React.useState(""); const [handle, setHandle] = React.useState("");
  const [selection, setSelection] = React.useState({ ageStyle: "틴", hairStyle: "몽글", skinTone: "미디엄", genderExpression: "뉴트럴" });
  const canCreate =
    onboarding === "1" ||
    fanProfiles.length === 0 ||
    fanProfiles.some(
      (profile) => profile.status === "torimia" || profile.level >= 50,
    );
  const submit = async () => {
    if (!displayName.trim()) return;
    if (!canCreate) {
      crossAlert(
        "FAN 추가 잠김",
        "기존 FAN이 토르미아 또는 Lv.50에 도달하면 새 FAN을 추가할 수 있어요.",
      );
      return;
    }
    try {
      await createFanProfile({
        displayName: displayName.trim(),
        ...(handle.trim() ? { handle: handle.trim() } : {}),
        ...(onboarding === "1" ? { customizeDefault: true } : {}),
        customization: selection,
      });
      if (onboarding === "1") {
        await AsyncStorage.setItem(ONBOARDING_KEY, "1");
        router.replace("/(tabs)" as never);
      } else {
        router.replace("/profiles" as never);
      }
    } catch (error) {
      const errorCode =
        error && typeof error === "object" && "data" in error
          ? (error as { data?: { error?: string } }).data?.error
          : null;
      const locked =
        errorCode === "FAN_EXPANSION_LOCKED" ||
        (error instanceof Error && error.message.includes("FAN_EXPANSION_LOCKED"));
      crossAlert("FAN 생성 안내", locked ? "기존 FAN이 토르미아 또는 Lv.50에 도달하면 새 FAN을 만들 수 있어요." : "FAN 캐릭터를 만들지 못했어요. 핸들과 입력값을 확인해 주세요.");
    }
  };
  return <NeonBackdrop style={styles.root}><View style={[styles.header, { paddingTop: insets.top + 8 }]}><Pressable onPress={() => router.back()}><Feather name="chevron-left" size={28} color="#fff" /></Pressable><Text style={styles.title}>새 FAN 만들기</Text><View style={{ width: 28 }} /></View><ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}><Text style={styles.lead}>{canCreate ? "독립된 피드와 성장을 가진 FAN 캐릭터를 만드세요." : "기존 FAN이 토르미아 또는 Lv.50에 도달하면 새 FAN을 추가할 수 있어요."}</Text><Text style={styles.label}>캐릭터 이름</Text><TextInput editable={canCreate} value={displayName} onChangeText={setDisplayName} maxLength={30} placeholder="이름 입력" placeholderTextColor="#777184" style={styles.input} /><Text style={styles.label}>공개 핸들 (선택)</Text><TextInput editable={canCreate} value={handle} onChangeText={setHandle} autoCapitalize="none" maxLength={24} placeholder="fan-name" placeholderTextColor="#777184" style={styles.input} />{(Object.keys(OPTIONS) as Array<keyof typeof OPTIONS>).map((key) => <View key={key} style={styles.section}><Text style={styles.label}>{key === "ageStyle" ? "연령 스타일" : key === "hairStyle" ? "헤어" : key === "skinTone" ? "톤" : "표현"}</Text><View style={styles.options}>{OPTIONS[key].map((value) => <Pressable disabled={!canCreate} key={value} onPress={() => setSelection((current) => ({ ...current, [key]: value }))} style={[styles.chip, selection[key] === value && styles.chipActive]}><Text style={[styles.chipText, selection[key] === value && styles.chipTextActive]}>{value}</Text></Pressable>)}</View></View>)}<Pressable disabled={!canCreate || !displayName.trim() || isCreatingFan} onPress={() => void submit()} style={[styles.submit, (!canCreate || !displayName.trim() || isCreatingFan) && { opacity: 0.45 }]}>{isCreatingFan ? <ActivityIndicator color="#fff" /> : <><Feather name={canCreate ? "star" : "lock"} size={18} color="#fff" /><Text style={styles.submitText}>{canCreate ? "FAN 소환하기" : "추가 조건 미달"}</Text></>}</Pressable></ScrollView></NeonBackdrop>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#05050B" }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 14 }, title: { color: "#fff", fontSize: 19, fontWeight: "800" }, content: { padding: 20, gap: 12 }, lead: { color: "#BEB7CC", fontSize: 14, lineHeight: 21, marginBottom: 8 }, label: { color: "#F5F1FF", fontSize: 13, fontWeight: "700" }, input: { minHeight: 48, borderWidth: 1, borderColor: "#49336A", borderRadius: 14, paddingHorizontal: 14, color: "#fff", backgroundColor: "#0D0B18" }, section: { gap: 9, marginTop: 6 }, options: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { borderWidth: 1, borderColor: "#3A3150", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }, chipActive: { backgroundColor: "#743BF5", borderColor: "#A66BFF" }, chipText: { color: "#A9A1B8", fontSize: 12 }, chipTextActive: { color: "#fff", fontWeight: "700" }, submit: { marginTop: 18, minHeight: 54, borderRadius: 18, backgroundColor: "#743BF5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, submitText: { color: "#fff", fontSize: 15, fontWeight: "800" } });
