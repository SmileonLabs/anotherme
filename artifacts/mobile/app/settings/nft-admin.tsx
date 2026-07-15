import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useNftAdmin } from "@/hooks/useNftAdmin";

export default function NftAdminScreen() {
  const colors = useColors();
  const { admin, collections, isLoading, create, analyze, review } = useNftAdmin();
  const [form, setForm] = React.useState({ chainId: "1", contractAddress: "", rpcUrl: "", name: "", ipName: "", category: "character", officialUrl: "" });
  const [message, setMessage] = React.useState<string | null>(null);
  const submit = async () => {
    if (!form.contractAddress.trim() || !form.name.trim() || !form.ipName.trim()) return;
    try { await create.mutateAsync({ ...form, chainId: Number(form.chainId) || 1 }); setMessage("컬렉션을 등록했어요. AI 분석을 실행해 주세요."); setForm((value) => ({ ...value, contractAddress: "", name: "", ipName: "" })); } catch { setMessage("컬렉션 등록에 실패했어요."); }
  };
  if (admin && !admin.isAdmin) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.foreground }}>관리자 권한이 필요합니다.</Text></View>;
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <Text style={[styles.title, { color: colors.foreground }]}>NFT 컬렉션 관리</Text>
    <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>허용할 IP를 등록하고 AI 성장 RPG 초안을 검토합니다.</Text>
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      {(["chainId", "contractAddress", "rpcUrl", "name", "ipName", "category", "officialUrl"] as const).map((key) => <TextInput key={key} value={form[key]} onChangeText={(value) => setForm((previous) => ({ ...previous, [key]: value }))} placeholder={key} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />)}
      <Pressable onPress={() => void submit()} disabled={create.isPending} style={[styles.primary, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground }}>{create.isPending ? "등록 중" : "컬렉션 등록"}</Text></Pressable>
      {message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}
    </View>
    {isLoading ? <ActivityIndicator color={colors.primary} /> : collections.map((item) => <View key={item.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={[styles.itemTitle, { color: colors.foreground }]}>{item.ipName} · {item.category}</Text><Text style={[styles.itemMeta, { color: colors.mutedForeground }]}>{item.status} · {item.contractAddress}</Text><View style={styles.actions}><Pressable onPress={() => void analyze.mutateAsync(item.id)} style={[styles.small, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.foreground }}>AI 분석</Text></Pressable>{item.status === "review_required" ? <Pressable onPress={() => void review.mutateAsync({ id: item.id, action: "approve" })} style={[styles.small, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground }}>승인</Text></Pressable> : null}{item.status === "approved" ? <Pressable onPress={() => void review.mutateAsync({ id: item.id, action: "publish" })} style={[styles.small, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground }}>게시</Text></Pressable> : null}</View></View>)}
  </View>;
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 18, gap: 12 }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, title: { fontSize: 22, fontFamily: "Inter_700Bold" }, subtitle: { fontSize: 12, lineHeight: 18 }, card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 9 }, input: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11 }, primary: { borderRadius: 10, minHeight: 42, alignItems: "center", justifyContent: "center" }, message: { fontSize: 12 }, itemTitle: { fontSize: 15, fontFamily: "Inter_700Bold" }, itemMeta: { fontSize: 11 }, actions: { flexDirection: "row", gap: 8 }, small: { borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 } });
