import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useNftAdmin } from "@/hooks/useNftAdmin";

export default function AdminIpProfilesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { collections, isLoading } = useNftAdmin();
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}><Text style={[styles.title, { color: colors.foreground }]}>IP·캐릭터</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>NFT와 연결된 IP·캐릭터·성장 콘텐츠를 관리합니다.</Text>{isLoading ? <ActivityIndicator color={colors.primary} /> : collections.length === 0 ? <View style={[styles.empty, { borderColor: colors.border }]}><Feather name="user" size={26} color={colors.mutedForeground} /><Text style={{ color: colors.foreground }}>등록된 IP가 없습니다.</Text><Text style={{ color: colors.mutedForeground }}>NFT 컬렉션을 먼저 등록해 주세요.</Text></View> : collections.map((item) => <Pressable key={item.id} onPress={() => router.push(`/admin/ip-profiles/${item.id}` as never)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.row}><View style={[styles.avatar, { backgroundColor: colors.primary + "22" }]}><Feather name="user" size={19} color={colors.primary} /></View><View style={styles.main}><Text style={[styles.name, { color: colors.foreground }]}>{item.ipName || item.name}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{item.category} · Chain {item.chainId}</Text></View><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></View><Text style={[styles.status, { color: colors.primary }]}>컬렉션 상태: {item.status}</Text></Pressable>)}</ScrollView>;
}
const styles = StyleSheet.create({ container: { padding: 18, gap: 12 }, title: { fontSize: 23, fontWeight: "800" }, subtitle: { fontSize: 12 }, card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 9 }, row: { flexDirection: "row", alignItems: "center", gap: 10 }, avatar: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" }, main: { flex: 1, gap: 3 }, name: { fontSize: 16, fontWeight: "700" }, meta: { fontSize: 11 }, status: { fontSize: 11 }, empty: { minHeight: 160, borderWidth: 1, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 8 } });
