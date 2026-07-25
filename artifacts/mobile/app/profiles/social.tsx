import { Avatar } from "@/components/Avatar";
import { NeonBackdrop } from "@/components/NeonUI";
import { useCharacterProfiles } from "@/hooks/useCharacterProfiles";
import { customFetch } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type SocialTab = "followers" | "following";

type SocialProfile = {
  id: string;
  type: "fan" | "star" | "official_ai";
  handle: string;
  displayName: string;
  profileImageUrl: string | null;
  statusMessage: string | null;
  followedAt: string;
};

type SocialResponse = {
  profileId: string;
  scope: SocialTab;
  profiles: SocialProfile[];
};

function tabFromValue(value: string | string[] | undefined): SocialTab {
  return value === "following" ? "following" : "followers";
}

export default function ProfileSocialScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const tab = tabFromValue(params.tab);
  const { activeProfile } = useCharacterProfiles();
  const query = useQuery({
    queryKey: ["character-profile-social", activeProfile?.id ?? "pending", tab],
    enabled: Boolean(activeProfile?.id),
    queryFn: () => customFetch<SocialResponse>(`/api/users/me/profile-social?scope=${tab}`, {
      responseType: "json",
      headers: { "x-character-profile-id": activeProfile!.id },
    }),
  });
  const profiles = query.data?.profiles ?? [];

  const selectTab = React.useCallback((nextTab: SocialTab) => {
    router.replace(`/profiles/social?tab=${nextTab}` as never);
  }, [router]);

  const goBack = React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/persona" as never);
  }, [router]);

  return (
    <NeonBackdrop style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로 가기" hitSlop={12} onPress={goBack} style={styles.backButton}>
          <Feather name="arrow-left" size={25} color="#F6F2FC" />
        </Pressable>
        <Text style={styles.title}>팔로우</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabs}>
        {(["followers", "following"] as const).map((item) => {
          const active = item === tab;
          return (
            <Pressable key={item} onPress={() => selectTab(item)} style={[styles.tab, active && styles.tabActive]}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{item === "followers" ? "팔로워" : "팔로잉"}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor="#B466FF" />}
        contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 16) + 20 }, !query.isLoading && profiles.length === 0 && styles.emptyList]}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.displayName} 프로필 보기`}
            onPress={() => router.push({ pathname: "/character/[profileId]", params: { profileId: item.id } } as never)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.avatarRing}>
              <Avatar uri={item.profileImageUrl} name={item.displayName} size={54} crop="face" characterType={item.type} />
            </View>
            <View style={styles.profileCopy}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{item.displayName}</Text>
                <Text style={styles.type}>{item.type === "official_ai" ? "OFFICIAL" : item.type.toUpperCase()}</Text>
              </View>
              <Text style={styles.handle} numberOfLines={1}>@{item.handle}</Text>
              {item.statusMessage ? <Text style={styles.status} numberOfLines={1}>{item.statusMessage}</Text> : null}
            </View>
            <Feather name="chevron-right" size={22} color="#8C829C" />
          </Pressable>
        )}
        ListEmptyComponent={
          query.isLoading ? (
            <View style={styles.empty}><ActivityIndicator size="large" color="#B466FF" /></View>
          ) : query.isError ? (
            <Pressable accessibilityRole="button" onPress={() => void query.refetch()} style={styles.empty}>
              <Feather name="alert-circle" size={35} color="#E6A2FF" />
              <Text style={styles.emptyTitle}>팔로워 목록을 불러오지 못했어요</Text>
              <Text style={styles.emptyBody}>잠시 후 다시 시도해 주세요.</Text>
            </Pressable>
          ) : (
            <View style={styles.empty}>
              <Feather name={tab === "followers" ? "users" : "user-plus"} size={35} color="#9164C6" />
              <Text style={styles.emptyTitle}>{tab === "followers" ? "아직 팔로워가 없어요" : "아직 팔로우한 프로필이 없어요"}</Text>
              <Text style={styles.emptyBody}>{tab === "followers" ? "새 팔로워가 생기면 여기에 표시됩니다." : "관심 있는 프로필을 팔로우해 보세요."}</Text>
            </View>
          )
        }
      />
    </NeonBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#05030B" },
  header: { minHeight: 64, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { color: "#F7F2FF", fontFamily: "Inter_700Bold", fontSize: 19 },
  headerSpacer: { width: 44 },
  tabs: { flexDirection: "row", marginHorizontal: 16, padding: 4, borderWidth: 1, borderColor: "rgba(170, 93, 255, .25)", borderRadius: 16, backgroundColor: "rgba(16, 10, 31, .88)" },
  tab: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  tabActive: { backgroundColor: "rgba(137, 63, 237, .38)", shadowColor: "#B55BFF", shadowOpacity: .45, shadowRadius: 12, elevation: 3 },
  tabText: { color: "#9389A2", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  tabTextActive: { color: "#F9F2FF" },
  list: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  emptyList: { flexGrow: 1 },
  row: { minHeight: 84, flexDirection: "row", alignItems: "center", gap: 13, padding: 13, borderRadius: 19, borderWidth: 1, borderColor: "rgba(162, 100, 238, .26)", backgroundColor: "rgba(12, 8, 25, .9)" },
  rowPressed: { opacity: .76, transform: [{ scale: .99 }] },
  avatarRing: { padding: 2, borderRadius: 30, borderWidth: 1, borderColor: "#9E59E9" },
  profileCopy: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { maxWidth: "72%", color: "#F5F0F8", fontFamily: "Inter_700Bold", fontSize: 16 },
  type: { color: "#C580FF", fontFamily: "Inter_600SemiBold", fontSize: 10 },
  handle: { color: "#9F95AE", fontFamily: "Inter_400Regular", fontSize: 12 },
  status: { marginTop: 2, color: "#C0B7CA", fontFamily: "Inter_400Regular", fontSize: 13 },
  empty: { flex: 1, minHeight: 300, alignItems: "center", justifyContent: "center", paddingHorizontal: 36, gap: 12 },
  emptyTitle: { color: "#F1EBF8", fontFamily: "Inter_700Bold", fontSize: 17, textAlign: "center" },
  emptyBody: { color: "#A89FB3", fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, textAlign: "center" },
});
