import { CustomFlatList } from "@/components/CustomScroll";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useListFriends, useCreateRoom, useGetMe } from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";
import { useThemeMode } from "@/hooks/useThemeMode";
import { gradients, gradientsDark } from "@/constants/colors";


export default function FriendsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { scheme } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { data: me } = useGetMe();
  const { data: friends = [], isLoading, refetch, isRefetching } = useListFriends();
  const createRoom = useCreateRoom();
  const [query, setQuery] = React.useState("");

  // Re-fetch whenever the screen regains focus so nickname/profile edits made
  // elsewhere (or on another device) are reflected without a manual refresh.
  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const handleOpenChat = async (friendId: string) => {
    const room = await createRoom.mutateAsync({
      data: { type: "direct", memberIds: [friendId] },
    });
    router.push({ pathname: "/chat/[id]", params: { id: room.id } });
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? friends.filter(
        (f) =>
          f.nickname?.toLowerCase().includes(q) ||
          f.statusMessage?.toLowerCase().includes(q),
      )
    : friends;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.brand, { color: colors.foreground }]}>친구</Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="친구 요청"
            hitSlop={8}
            onPress={() => router.push("/friends/requests")}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Feather name="user-check" size={22} color={colors.foreground} />
          </Pressable>
          <Pressable
            accessibilityLabel="친구 추가"
            hitSlop={8}
            onPress={() => router.push("/friends/add")}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Feather name="user-plus" size={22} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: colors.muted }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={query}
            onChangeText={setQuery}
            placeholder="친구 검색"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable hitSlop={8} onPress={() => setQuery("")}>
              <Feather name="x-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <CustomFlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          filtered.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            {/* My profile card */}
            <Pressable
              onPress={() => router.push("/profile/edit")}
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
            >
              <LinearGradient
                colors={(scheme === "dark" ? gradientsDark : gradients).soft}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.profileCard}
              >
                <Avatar uri={me?.profileImageUrl} name={me?.nickname ?? "?"} size={52} />
                <View style={styles.profileInfo}>
                  <Text style={[styles.profileLabel, { color: colors.mutedForeground }]}>
                    나의 프로필
                  </Text>
                  <Text style={[styles.profileName, { color: colors.foreground }]} numberOfLines={1}>
                    {me?.nickname ?? "내 프로필"}
                  </Text>
                  <Text
                    style={[styles.profileStatus, { color: colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    {me?.statusMessage ?? "상태 메시지를 등록해보세요"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
              </LinearGradient>
            </Pressable>

            {/* Add friend CTA */}
            <Pressable
              onPress={() => router.push("/friends/add")}
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, marginTop: 14 })}
            >
              <LinearGradient
                colors={gradients.cta}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaBtn}
              >
                <Feather name="user-plus" size={18} color="#fff" />
                <Text style={styles.ctaText}>친구 추가</Text>
              </LinearGradient>
            </Pressable>

            {/* List section title */}
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>친구 목록</Text>
              <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
                전체 {friends.length}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon="users"
              title={q ? "검색 결과가 없습니다" : "아직 친구가 없습니다"}
              subtitle={q ? "다른 이름으로 검색해보세요" : "친구 추가 버튼을 눌러 친구를 찾아보세요"}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.friendItem,
              { backgroundColor: colors.background, opacity: pressed ? 0.6 : 1 },
            ]}
            onPress={() => handleOpenChat(item.id)}
          >
            <Avatar uri={item.profileImageUrl} name={item.nickname} size={50} />
            <View style={styles.friendInfo}>
              <Text style={[styles.friendName, { color: colors.foreground }]} numberOfLines={1}>
                {item.nickname}
              </Text>
              {item.statusMessage ? (
                <Text
                  style={[styles.friendStatus, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {item.statusMessage}
                </Text>
              ) : null}
            </View>
            <Feather name="message-circle" size={20} color={colors.mutedForeground} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  brand: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerActions: { flexDirection: "row", gap: 6 },
  iconBtn: { padding: 6 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 0,
  },
  listContent: { paddingBottom: 120, paddingHorizontal: 16 },
  emptyContainer: { flexGrow: 1, paddingHorizontal: 16, minHeight: 400 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 18,
  },
  profileInfo: { flex: 1, gap: 1 },
  profileLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  profileName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  profileStatus: { fontSize: 13, fontFamily: "Inter_400Regular" },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: 14,
  },
  ctaText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 22,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  sectionCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  friendInfo: { flex: 1, gap: 2 },
  friendName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  friendStatus: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
