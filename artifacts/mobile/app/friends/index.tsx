import { CustomFlatList } from "@/components/CustomScroll";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import {
  FlatList,
  Modal,
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
import { useQueryClient } from "@tanstack/react-query";
import {
  getListFriendsQueryKey,
  getListRoomsQueryKey,
  useListFriends,
  useCreateRoom,
  useGetMe,
} from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";
import { useThemeMode } from "@/hooks/useThemeMode";
import { gradients, gradientsDark } from "@/constants/colors";
import { crossAlert } from "@/lib/crossAlert";
import { updateFriendAlias, userDisplayName } from "@/lib/friendNames";


export default function FriendsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const colors = useColors();
  const { scheme } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { data: me } = useGetMe();
  const { data: friends = [], isLoading, refetch, isRefetching } = useListFriends();
  const createRoom = useCreateRoom();
  const [query, setQuery] = React.useState("");
  const [editingFriend, setEditingFriend] = React.useState<any | null>(null);
  const [aliasDraft, setAliasDraft] = React.useState("");
  const [aliasSaving, setAliasSaving] = React.useState(false);

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

  const openAliasEditor = (friend: any) => {
    setEditingFriend(friend);
    setAliasDraft(friend.friendAlias ?? "");
  };

  const closeAliasEditor = () => {
    if (aliasSaving) return;
    setEditingFriend(null);
    setAliasDraft("");
  };

  const saveAlias = async (value: string | null) => {
    if (!editingFriend || aliasSaving) return;
    const nextAlias = value === null ? null : value.trim() || null;
    if (nextAlias && nextAlias.length > 50) {
      crossAlert("이름이 너무 깁니다", "친구 이름은 50자 이하로 입력해주세요.");
      return;
    }

    setAliasSaving(true);
    try {
      const updated = await updateFriendAlias(editingFriend.id, nextAlias);
      queryClient.setQueryData<any[]>(getListFriendsQueryKey(), (old = []) =>
        old.map((friend) => (friend.id === editingFriend.id ? { ...friend, ...updated } : friend)),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListFriendsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListRoomsQueryKey() }),
      ]);
      setEditingFriend(null);
      setAliasDraft("");
    } catch {
      crossAlert("오류", "친구 이름을 저장하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setAliasSaving(false);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? friends.filter(
        (f) => {
          const displayName = userDisplayName(f, "").toLowerCase();
          return (
            displayName.includes(q) ||
            f.nickname?.toLowerCase().includes(q) ||
            f.statusMessage?.toLowerCase().includes(q)
          );
        },
      )
    : friends;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <Pressable
            accessibilityLabel="뒤로"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Feather name="chevron-left" size={26} color={colors.primary} />
          </Pressable>
          <Text style={[styles.brand, { color: colors.foreground }]}>친구</Text>
        </View>
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
        renderItem={({ item }) => {
          const displayName = userDisplayName(item);
          const hasAlias = !!(item as any).friendAlias;
          return (
            <View style={[styles.friendItem, { backgroundColor: colors.background }]}>
              <Pressable
                style={({ pressed }) => [styles.friendMain, { opacity: pressed ? 0.6 : 1 }]}
                onPress={() => handleOpenChat(item.id)}
              >
                <Avatar uri={item.profileImageUrl} name={displayName} size={50} />
                <View style={styles.friendInfo}>
                  <Text style={[styles.friendName, { color: colors.foreground }]} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text
                    style={[styles.friendStatus, { color: colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    {hasAlias ? item.nickname : item.statusMessage || "상태 메시지 없음"}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.friendActions}>
                <Pressable
                  accessibilityLabel="친구 이름 수정"
                  hitSlop={8}
                  onPress={() => openAliasEditor(item)}
                  style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.5 : 1 }]}
                >
                  <Feather name="edit-2" size={18} color={colors.mutedForeground} />
                </Pressable>
                <Pressable
                  accessibilityLabel="채팅 열기"
                  hitSlop={8}
                  onPress={() => handleOpenChat(item.id)}
                  style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.5 : 1 }]}
                >
                  <Feather name="message-circle" size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <Modal
        visible={!!editingFriend}
        transparent
        animationType="fade"
        onRequestClose={closeAliasEditor}
      >
        <Pressable style={styles.modalOverlay} onPress={closeAliasEditor}>
          <Pressable
            style={[styles.aliasSheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {}}
          >
            <Text style={[styles.aliasTitle, { color: colors.foreground }]}>친구 이름 수정</Text>
            <Text style={[styles.aliasHint, { color: colors.mutedForeground }]}>
              내 화면에서만 보이는 이름입니다. 비워두면 원래 닉네임으로 표시됩니다.
            </Text>
            <TextInput
              value={aliasDraft}
              onChangeText={setAliasDraft}
              placeholder={editingFriend?.nickname ?? "친구 이름"}
              placeholderTextColor={colors.mutedForeground}
              maxLength={50}
              autoFocus
              selectTextOnFocus
              style={[
                styles.aliasInput,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
              ]}
            />
            <View style={styles.aliasActions}>
              <Pressable
                disabled={aliasSaving}
                onPress={() => saveAlias(null)}
                style={({ pressed }) => [styles.aliasBtn, { opacity: pressed || aliasSaving ? 0.55 : 1 }]}
              >
                <Text style={[styles.aliasBtnText, { color: colors.mutedForeground }]}>초기화</Text>
              </Pressable>
              <Pressable
                disabled={aliasSaving}
                onPress={closeAliasEditor}
                style={({ pressed }) => [styles.aliasBtn, { opacity: pressed || aliasSaving ? 0.55 : 1 }]}
              >
                <Text style={[styles.aliasBtnText, { color: colors.mutedForeground }]}>취소</Text>
              </Pressable>
              <Pressable
                disabled={aliasSaving}
                onPress={() => saveAlias(aliasDraft)}
                style={({ pressed }) => [
                  styles.aliasSaveBtn,
                  { backgroundColor: colors.primary, opacity: pressed || aliasSaving ? 0.7 : 1 },
                ]}
              >
                <Text style={styles.aliasSaveText}>{aliasSaving ? "저장 중..." : "저장"}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 4 },
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
  friendMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  friendInfo: { flex: 1, gap: 2 },
  friendActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionBtn: { padding: 8 },
  friendName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  friendStatus: { fontSize: 13, fontFamily: "Inter_400Regular" },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  aliasSheet: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  aliasTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  aliasHint: { marginTop: 6, fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  aliasInput: {
    marginTop: 16,
    height: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  aliasActions: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  aliasBtn: { paddingHorizontal: 10, paddingVertical: 10 },
  aliasBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  aliasSaveBtn: { minWidth: 72, alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  aliasSaveText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
});
