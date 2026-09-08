import React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useAdminAudit } from "@/hooks/useAdminAudit";

export default function AdminAuditLogsScreen() {
  const colors = useColors();
  const { data = [], isLoading } = useAdminAudit();
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
    <Text style={[styles.title, { color: colors.foreground }]}>감사 로그</Text>
    <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>관리자 작업 이력을 최근 순서로 확인합니다.</Text>
    {isLoading ? <ActivityIndicator color={colors.primary} /> : data.length === 0 ? <Text style={{ color: colors.mutedForeground }}>기록된 작업이 없습니다.</Text> : data.map((row) => <View key={row.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.action, { color: colors.primary }]}>{row.action}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{row.targetType}{row.targetId ? ` · ${row.targetId}` : ""}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{new Date(row.createdAt).toLocaleString()}</Text>{row.reason ? <Text style={[styles.reason, { color: colors.foreground }]}>{row.reason}</Text> : null}</View>)}
  </ScrollView>;
}

const styles = StyleSheet.create({ container: { padding: 18, gap: 12 }, title: { fontSize: 23, fontWeight: "800" }, subtitle: { fontSize: 12 }, card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 5 }, action: { fontSize: 14, fontWeight: "800" }, meta: { fontSize: 11 }, reason: { fontSize: 12, marginTop: 4 } });
