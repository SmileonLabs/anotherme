import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { customFetch } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { crossAlert } from "@/lib/crossAlert";

type Profile = { id: string; type: string; handle: string; displayName: string; status: string; level: number; xp: number; jobKey: string | null; jobStage: number };
type Detail = {
  member: { nickname: string; email: string; createdAt: string };
  profiles: Profile[];
  sections: { wallets: unknown[]; activity: { postCount: number; reportCount: number; blocks: unknown[] } };
};

export default function AdminMemberDetailScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useQuery({ queryKey: ["admin", "member", id], queryFn: () => customFetch<Detail>(`/api/admin/members/${id}`, { responseType: "json" }) });
  const statusMutation = useMutation({
    mutationFn: ({ profileId, status }: { profileId: string; status: "active" | "locked" }) => customFetch(`/api/admin/profiles/${profileId}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, reason: "관리자 회원 상세 화면에서 상태 변경" }), responseType: "json" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "member", id] }),
    onError: () => crossAlert("상태 변경 실패", "관리자 권한과 프로필 상태를 확인해 주세요."),
  });
  if (detail.isLoading) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  if (!detail.data) return <View style={[styles.center, { backgroundColor: colors.background }]}><Text style={{ color: colors.foreground }}>회원을 찾을 수 없습니다.</Text></View>;
  const { member, profiles, sections } = detail.data;
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>{member.nickname}</Text>
        <Text style={{ color: colors.mutedForeground }}>{member.email}</Text>
        <Text style={{ color: colors.mutedForeground }}>가입일 {new Date(member.createdAt).toLocaleDateString("ko-KR")}</Text>
      </View>
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>캐릭터 프로필 {profiles.length}개</Text>
        {profiles.map((profile) => (
          <View key={profile.id} style={[styles.profile, { borderColor: colors.border }]}>
            <View style={styles.row}><Text style={[styles.name, { color: colors.foreground }]}>{profile.displayName}</Text><Text style={{ color: colors.mutedForeground }}>{profile.status}</Text></View>
            <Text style={{ color: colors.mutedForeground }}>@{profile.handle} · {profile.type.toUpperCase()} · Lv.{profile.level} · {profile.xp} XP</Text>
            {profile.jobKey ? <Text style={{ color: colors.mutedForeground }}>{profile.jobKey} · 직업 {profile.jobStage}단계</Text> : null}
            <Pressable disabled={statusMutation.isPending} onPress={() => statusMutation.mutate({ profileId: profile.id, status: profile.status === "locked" ? "active" : "locked" })} style={[styles.action, { borderColor: colors.primary }]}>
              <Text style={{ color: colors.primary, fontWeight: "700" }}>{profile.status === "locked" ? "잠금 해제" : "프로필 잠금"}</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>운영 요약</Text>
        <Summary label="연결 지갑" value={sections.wallets.length} colors={colors} />
        <Summary label="작성 게시물" value={sections.activity.postCount} colors={colors} />
        <Summary label="게시물 신고" value={sections.activity.reportCount} colors={colors} />
        <Summary label="차단 관계" value={sections.activity.blocks.length} colors={colors} />
      </View>
    </ScrollView>
  );
}

function Summary({ label, value, colors }: { label: string; value: number; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.row}><Text style={{ color: colors.mutedForeground }}>{label}</Text><Text style={{ color: colors.foreground, fontWeight: "700" }}>{value}</Text></View>;
}
const styles = StyleSheet.create({
  container: { padding: 18, gap: 12, paddingBottom: 48 }, center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { borderWidth: 1, borderRadius: 18, padding: 20, gap: 7 }, title: { fontSize: 23, fontWeight: "800" },
  section: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }, sectionTitle: { fontSize: 17, fontWeight: "800" },
  profile: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 8 }, row: { flexDirection: "row", justifyContent: "space-between", gap: 12 }, name: { fontSize: 15, fontWeight: "800" },
  action: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
});
