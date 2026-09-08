import { Avatar } from "@/components/Avatar";
import { gradients } from "@/constants/colors";
import { crossAlert } from "@/lib/crossAlert";
import { userDisplayName } from "@/lib/friendNames";
import { useCreateRoom, useListFriends } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CATEGORIES = [
  { key: "fanclub", label: "팬클럽" },
  { key: "counseling", label: "고민상담" },
  { key: "friend_finding", label: "친구찾기" },
  { key: "meetup", label: "번개·만남" },
  { key: "casual", label: "잡담" },
  { key: "peer", label: "또래방" },
  { key: "karaoke", label: "노래방" },
] as const;

export default function GroupCreateScreenV2() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const friendsQuery = useListFriends();
  const createRoom = useCreateRoom();
  const friends = friendsQuery.data ?? [];
  const [groupName, setGroupName] = React.useState("");
  const [category, setCategory] = React.useState<(typeof CATEGORIES)[number]["key"]>("fanclub");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const goBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/chats" as never);
  }, [router]);

  const visibleFriends = React.useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko-KR");
    if (!keyword) return friends;
    return friends.filter((friend) => {
      const name = userDisplayName(friend).toLocaleLowerCase("ko-KR");
      const status = friend.statusMessage?.toLocaleLowerCase("ko-KR") ?? "";
      return name.includes(keyword) || status.includes(keyword);
    });
  }, [friends, query]);

  const allVisibleSelected =
    visibleFriends.length > 0 && visibleFriends.every((friend) => selected.includes(friend.id));
  const canCreate = groupName.trim().length > 0 && selected.length > 0 && !createRoom.isPending;

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const toggleAll = () => {
    const visibleIds = visibleFriends.map((friend) => friend.id);
    setSelected((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...current, ...visibleIds])),
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      crossAlert("그룹 이름을 입력해주세요.");
      return;
    }
    if (selected.length === 0) {
      crossAlert("초대할 친구를 한 명 이상 선택해주세요.");
      return;
    }
    try {
      const room = await createRoom.mutateAsync({
        data: {
          type: "group",
          name: groupName.trim(),
          memberIds: selected,
          category,
          visibility: "invite_only",
        } as never,
      });
      router.replace({ pathname: "/chat/[id]", params: { id: room.id } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("FRIEND_REQUIRED")) {
        crossAlert("친구만 초대할 수 있어요.", "친구 상태를 새로 확인한 뒤 다시 시도해주세요.");
      } else if (message.includes("BLOCKED_MEMBER")) {
        crossAlert("초대할 수 없는 사용자입니다.", "차단 관계를 확인해주세요.");
      } else {
        crossAlert("그룹 채팅을 만들지 못했어요.", "잠시 후 다시 시도해주세요.");
      }
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable accessibilityLabel="뒤로 가기" onPress={goBack} hitSlop={12}>
          <Feather name="chevron-left" size={36} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title}>그룹 채팅 만들기</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={visibleFriends}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <Text style={styles.sectionTitle}>그룹 이름</Text>
            <View style={styles.nameField}>
              <TextInput
                value={groupName}
                onChangeText={setGroupName}
                maxLength={30}
                placeholder="그룹 이름을 입력해주세요"
                placeholderTextColor="#777280"
                style={styles.nameInput}
              />
              <Text style={styles.counter}>{groupName.length}/30</Text>
            </View>

            <Text style={[styles.sectionTitle, styles.categoryTitle]}>방 분류 선택</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categories}
            >
              {CATEGORIES.map((item) => {
                const active = category === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setCategory(item.key)}
                    style={[styles.category, active && styles.categoryActive]}
                  >
                    <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.sectionTitle, styles.memberTitle]}>초대할 멤버</Text>
            <View style={styles.searchField}>
              <Feather name="search" size={25} color="#8B8592" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="이름을 검색해 친구를 선택하세요"
                placeholderTextColor="#777280"
                style={styles.searchInput}
              />
              {query ? (
                <Pressable onPress={() => setQuery("")} hitSlop={8}>
                  <Feather name="x-circle" size={20} color="#837D8A" />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.friendHeader}>
              <Text style={styles.friendTitle}>친구 목록</Text>
              <Pressable onPress={toggleAll} disabled={visibleFriends.length === 0}>
                <Text style={styles.selectAll}>
                  {allVisibleSelected ? "선택 해제" : "전체 선택"}
                </Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          friendsQuery.isLoading ? (
            <ActivityIndicator color="#9D5CFF" style={styles.loading} />
          ) : (
            <View style={styles.empty}>
              <Feather name="users" size={34} color="#777180" />
              <Text style={styles.emptyTitle}>
                {query ? "검색 결과가 없어요" : "초대할 수 있는 친구가 없어요"}
              </Text>
              {!query ? (
                <Pressable onPress={() => router.push("/friends/add")}>
                  <Text style={styles.addFriend}>친구 추가하기</Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const active = selected.includes(item.id);
          const name = userDisplayName(item);
          const characterProfile =
            (item as typeof item & {
              profile?: { profileImageUrl?: string | null; type?: string | null } | null;
            }).profile ?? null;
          return (
            <Pressable
              onPress={() => toggle(item.id)}
              style={[
                styles.friendRow,
                index === 0 && styles.friendRowFirst,
                index === visibleFriends.length - 1 && styles.friendRowLast,
              ]}
            >
              <Avatar
                uri={characterProfile?.profileImageUrl}
                name={name}
                size={54}
                crop="face"
                characterType={characterProfile?.type ?? "fan"}
              />
              <View style={styles.friendCopy}>
                <Text style={styles.friendName}>{name}</Text>
                <Text style={styles.friendStatus} numberOfLines={1}>
                  {item.statusMessage || "함께 이야기해요!"}
                </Text>
              </View>
              <View style={[styles.checkbox, active && styles.checkboxActive]}>
                {active ? <Feather name="check" size={22} color="#FFFFFF" /> : null}
              </View>
            </Pressable>
          );
        }}
      />

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          disabled={!canCreate}
          onPress={handleCreate}
          style={({ pressed }) => [
            styles.createButton,
            !canCreate && styles.createButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <LinearGradient
            colors={canCreate ? gradients.cta : ["#302A3C", "#302A3C"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.createGradient}
          >
            {createRoom.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={[styles.createText, !canCreate && styles.createTextDisabled]}>
                그룹 만들기{selected.length > 0 ? ` · ${selected.length}명` : ""}
              </Text>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#03030A" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  title: { color: "#FFFFFF", fontSize: 23, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerSpacer: { width: 36 },
  content: { paddingHorizontal: 20, paddingBottom: 140 },
  sectionTitle: { color: "#F2EFF5", fontSize: 18, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  nameField: {
    height: 62,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(112,83,154,0.24)",
    backgroundColor: "#0D0C16",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  nameInput: { flex: 1, color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_500Medium" },
  counter: { color: "#8A8491", fontSize: 14 },
  categoryTitle: { marginTop: 30 },
  categories: { gap: 8, paddingBottom: 2 },
  category: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: "#0D0C16",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryActive: { backgroundColor: "#8241F3", borderColor: "#B261FF" },
  categoryText: { color: "#AAA4B1", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  categoryTextActive: { color: "#FFFFFF" },
  memberTitle: { marginTop: 31 },
  searchField: {
    height: 62,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(112,83,154,0.24)",
    backgroundColor: "#0D0C16",
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_400Regular" },
  friendHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 25,
    marginBottom: 11,
  },
  friendTitle: { color: "#F2EFF5", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  selectAll: { color: "#B85CFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  friendRow: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(110,92,135,0.22)",
    backgroundColor: "#0D0C16",
  },
  friendRowFirst: { borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  friendRowLast: { borderBottomLeftRadius: 22, borderBottomRightRadius: 22, borderBottomWidth: 0 },
  friendCopy: { flex: 1, paddingHorizontal: 14, gap: 3 },
  friendName: { color: "#F5F2F7", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  friendStatus: { color: "#8D8794", fontSize: 13, fontFamily: "Inter_400Regular" },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#77717F",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: { backgroundColor: "#7732F7", borderColor: "#9D5CFF" },
  empty: { alignItems: "center", paddingVertical: 45, gap: 10 },
  emptyTitle: { color: "#A7A1AD", fontSize: 15 },
  addFriend: { color: "#B85CFF", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  loading: { marginTop: 42 },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: "rgba(3,3,10,0.96)",
  },
  createButton: { height: 62, borderRadius: 20, overflow: "hidden" },
  createButtonDisabled: { opacity: 0.75 },
  createGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
  createText: { color: "#FFFFFF", fontSize: 20, fontFamily: "Inter_600SemiBold" },
  createTextDisabled: { color: "#827B88" },
  pressed: { opacity: 0.75 },
});
