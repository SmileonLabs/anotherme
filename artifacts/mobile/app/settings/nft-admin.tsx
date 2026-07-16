import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useNftAdmin } from "@/hooks/useNftAdmin";

export default function NftAdminScreen() {
  const colors = useColors();
  const { admin, collections, isLoading, create, analyze, rpgAnalyze, review } = useNftAdmin();
  const [form, setForm] = React.useState({ chainId: "56", contractAddress: "", rpcUrl: "", name: "", ipName: "", category: "character", officialUrl: "" });
  const [message, setMessage] = React.useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = React.useState<NonNullable<typeof analyze.data> | null>(null);
  React.useEffect(() => {
    if (analyze.data) setAnalysisResult(analyze.data);
  }, [analyze.data]);
  const submit = async () => {
    if (!form.contractAddress.trim() || !form.name.trim() || !form.ipName.trim()) return;
    try { await create.mutateAsync({ ...form, chainId: Number(form.chainId) || 1 }); setMessage("컬렉션을 등록했어요. AI 분석을 실행해 주세요."); setForm((value) => ({ ...value, contractAddress: "", name: "", ipName: "" })); } catch { setMessage("컬렉션 등록에 실패했어요."); }
  };
  if (admin && !admin.isAdmin) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.foreground }}>관리자 권한이 필요합니다.</Text></View>;
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
    <Text style={[styles.title, { color: colors.foreground }]}>NFT 컬렉션 관리</Text>
    <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>허용할 IP를 등록하고 AI 성장 RPG 초안을 검토합니다.</Text>
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      {(["chainId", "contractAddress", "rpcUrl", "name", "ipName", "category", "officialUrl"] as const).map((key) => <TextInput key={key} value={form[key]} onChangeText={(value) => setForm((previous) => ({ ...previous, [key]: value }))} placeholder={key} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />)}
      <Pressable onPress={() => void submit()} disabled={create.isPending} style={[styles.primary, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground }}>{create.isPending ? "등록 중" : "컬렉션 등록"}</Text></Pressable>
      {message ? <Text style={[styles.message, { color: colors.primary }]}>{message}</Text> : null}
    </View>
    {isLoading ? <ActivityIndicator color={colors.primary} /> : collections.map((item) => <View key={item.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={[styles.itemTitle, { color: colors.foreground }]}>{item.ipName} · {item.category}</Text><Text style={[styles.itemMeta, { color: colors.mutedForeground }]}>{item.status} · {item.contractAddress}</Text><View style={styles.actions}><Pressable onPress={() => void analyze.mutateAsync(item.id)} style={[styles.small, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.foreground }}>AI 분석</Text></Pressable>{item.status === "review_required" ? <Pressable onPress={() => void review.mutateAsync({ id: item.id, action: "approve" })} style={[styles.small, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground }}>승인</Text></Pressable> : null}{item.status === "approved" ? <Pressable onPress={() => void review.mutateAsync({ id: item.id, action: "publish" })} style={[styles.small, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground }}>게시</Text></Pressable> : null}</View></View>)}
    {analysisResult ? <View style={[styles.resultCard, { borderColor: colors.primary, backgroundColor: colors.card }]}><Text style={[styles.resultTitle, { color: colors.foreground }]}>AI 분석 결과</Text><Text style={{ color: colors.foreground }}>역할: {analysisResult.roleName ?? "-"}</Text><Text style={{ color: colors.mutedForeground }}>세계관: {analysisResult.worldStyle ?? "-"}</Text><Text style={{ color: colors.mutedForeground }}>상태: {analysisResult.status}</Text><Pressable onPress={() => setAnalysisResult(null)} style={[styles.small, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.foreground }}>목록으로 돌아가기</Text></Pressable></View> : null}
    {collections.filter((item) => item.aiAnalyzedAt).map((item) => <View key={`analysis-${item.id}`} style={[styles.resultCard, { borderColor: colors.primary, backgroundColor: colors.card }]}><Text style={[styles.resultTitle, { color: colors.foreground }]}>저장된 AI 분석 · {item.ipName}</Text><Text style={{ color: colors.foreground }}>역할: {item.roleName ?? "-"}</Text><Text style={{ color: colors.mutedForeground }}>세계관: {item.worldStyle ?? "-"}</Text><Text style={{ color: colors.mutedForeground }}>분석일: {item.aiAnalyzedAt}</Text><Pressable disabled={rpgAnalyze.isPending} onPress={() => void rpgAnalyze.mutateAsync(item.id)} style={[styles.primary, { backgroundColor: colors.primary, opacity: rpgAnalyze.isPending ? 0.5 : 1 }]}><Text style={{ color: colors.primaryForeground }}>{rpgAnalyze.isPending ? "성장 RPG 생성 중…" : "성장 RPG 테마 생성"}</Text></Pressable></View>)}
    {analyze.isPending ? <View style={[styles.busyOverlay, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.foreground }}>AI가 NFT IP와 성장 RPG를 분석 중입니다…</Text><Text style={{ color: colors.mutedForeground }}>완료될 때까지 잠시만 기다려 주세요.</Text></View> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 18, gap: 12, position: "relative" }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, title: { fontSize: 22, fontFamily: "Inter_700Bold" }, subtitle: { fontSize: 12, lineHeight: 18 }, card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 9 }, resultCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 }, resultTitle: { fontSize: 18, fontFamily: "Inter_700Bold" }, busyOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 }, input: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11 }, primary: { borderRadius: 10, minHeight: 42, alignItems: "center", justifyContent: "center" }, message: { fontSize: 12 }, itemTitle: { fontSize: 15, fontFamily: "Inter_700Bold" }, itemMeta: { fontSize: 11 }, actions: { flexDirection: "row", gap: 8 }, small: { borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 } });
