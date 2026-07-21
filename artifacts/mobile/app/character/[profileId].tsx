import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { CustomScrollView } from "@/components/CustomScroll";
import { NeonBackdrop } from "@/components/NeonUI";

interface PublicCharacterProfileResponse {
  profile: {
    id: string;
    type: "fan" | "star" | "official_ai";
    handle: string;
    displayName: string;
    profileImageUrl: string | null;
    statusMessage: string | null;
    level: number;
    xp: number;
    isMine: boolean;
    followedByMe: boolean;
    followerCount: number;
    followingCount: number;
  };
  posts: { items: Array<{ id: string; kind: string; title: string; body: string; createdAt: string }> };
}

export default function PublicCharacterProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  const queryKey = ["public-character-profile", profileId] as const;
  const query = useQuery({
    queryKey,
    enabled: !!profileId,
    queryFn: () => customFetch<PublicCharacterProfileResponse>(`/api/profiles/${profileId}`, { responseType: "json" }),
  });
  const follow = useMutation({
    mutationFn: (following: boolean) => customFetch<{ following: boolean }>(`/api/profiles/${profileId}/follow`, { method: following ? "POST" : "DELETE", responseType: "json" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const profile = query.data?.profile;

  return (
    <NeonBackdrop style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="뒤로 가기"><Feather name="arrow-left" size={24} color="#F5F1FF" /></Pressable>
        <Text style={styles.headerTitle}>프로필</Text>
        <View style={{ width: 24 }} />
      </View>
      {query.isLoading ? <View style={styles.center}><ActivityIndicator color="#A855F7" /></View> : !profile ? (
        <View style={styles.center}><Text style={styles.errorTitle}>프로필을 불러오지 못했어요.</Text><Pressable onPress={() => void query.refetch()} style={styles.retry}><Text style={styles.retryText}>다시 시도</Text></Pressable></View>
      ) : (
        <CustomScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}>
          <View style={styles.profileCard}>
            <Avatar uri={profile.profileImageUrl} name={profile.displayName} size={92} />
            <Text style={styles.name}>{profile.displayName}</Text>
            <Text style={styles.handle}>@{profile.handle} · {profile.type.toUpperCase()}</Text>
            {profile.statusMessage ? <Text style={styles.status}>{profile.statusMessage}</Text> : null}
            <View style={styles.socialRow}>
              <View style={styles.socialItem}><Text style={styles.socialValue}>{profile.followerCount}</Text><Text style={styles.socialLabel}>팔로워</Text></View>
              <View style={styles.socialItem}><Text style={styles.socialValue}>{profile.followingCount}</Text><Text style={styles.socialLabel}>팔로잉</Text></View>
              <View style={styles.socialItem}><Text style={styles.socialValue}>Lv.{profile.level}</Text><Text style={styles.socialLabel}>성장</Text></View>
            </View>
            {profile.isMine ? (
              <Pressable onPress={() => router.push("/profile/edit")} style={styles.followButton}><Text style={styles.followText}>내 프로필 관리</Text></Pressable>
            ) : (
              <Pressable disabled={follow.isPending} onPress={() => follow.mutate(!profile.followedByMe)} style={[styles.followButton, profile.followedByMe && styles.followingButton]}><Text style={styles.followText}>{profile.followedByMe ? "팔로잉" : "팔로우"}</Text></Pressable>
            )}
          </View>
          <Text style={styles.sectionTitle}>게시물</Text>
          {query.data?.posts.items.length ? query.data.posts.items.map((post) => (
            <View key={post.id} style={styles.postCard}><Text style={styles.postKind}>{post.kind.toUpperCase()}</Text><Text style={styles.postTitle}>{post.title}</Text><Text style={styles.postBody} numberOfLines={4}>{post.body}</Text></View>
          )) : <View style={styles.empty}><Text style={styles.emptyText}>아직 공개 게시물이 없어요.</Text></View>}
        </CustomScrollView>
      )}
    </NeonBackdrop>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { minHeight: 60, paddingHorizontal: 18, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(139,92,246,0.3)" },
  headerTitle: { color: "#F5F1FF", fontSize: 18, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  errorTitle: { color: "#F5F1FF", fontSize: 16, fontFamily: "Inter_700Bold" },
  retry: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, backgroundColor: "#7C3AED" },
  retryText: { color: "#fff", fontFamily: "Inter_700Bold" },
  content: { padding: 18, gap: 18 },
  profileCard: { alignItems: "center", borderRadius: 22, borderWidth: 1, borderColor: "rgba(139,92,246,0.34)", backgroundColor: "#0B0918", padding: 22 },
  name: { color: "#F5F1FF", fontSize: 23, fontFamily: "Inter_800ExtraBold", marginTop: 12 },
  handle: { color: "#91899E", fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 4 },
  status: { color: "#C8C0D2", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 12 },
  socialRow: { width: "100%", flexDirection: "row", marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(139,92,246,0.24)", paddingTop: 16 },
  socialItem: { flex: 1, alignItems: "center", gap: 3 },
  socialValue: { color: "#F5F1FF", fontSize: 16, fontFamily: "Inter_800ExtraBold" },
  socialLabel: { color: "#817A8C", fontSize: 11, fontFamily: "Inter_500Medium" },
  followButton: { width: "100%", minHeight: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#7C3AED", marginTop: 18 },
  followingButton: { backgroundColor: "#272033" },
  followText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  sectionTitle: { color: "#F5F1FF", fontSize: 17, fontFamily: "Inter_800ExtraBold" },
  postCard: { borderRadius: 17, borderWidth: 1, borderColor: "rgba(139,92,246,0.22)", backgroundColor: "#090812", padding: 15, gap: 6 },
  postKind: { color: "#A855F7", fontSize: 10, fontFamily: "Inter_800ExtraBold" },
  postTitle: { color: "#F5F1FF", fontSize: 15, fontFamily: "Inter_700Bold" },
  postBody: { color: "#AFA7BA", fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  empty: { minHeight: 120, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#090812" },
  emptyText: { color: "#817A8C", fontSize: 13, fontFamily: "Inter_500Medium" },
});
