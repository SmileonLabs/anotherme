import { Avatar } from "@/components/Avatar";
import { NeonBackdrop } from "@/components/NeonUI";
import { userDisplayName } from "@/lib/friendNames";
import {
  useGetMe,
  useGetMyCharacterProfileNotifications,
  useListRooms,
  type ChatRoom,
} from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type RoomCategory =
  | "all"
  | "unread"
  | "group"
  | "fanclub"
  | "counseling"
  | "friend_finding"
  | "meetup"
  | "casual"
  | "peer"
  | "karaoke";

type CategorizedRoom = ChatRoom & {
  category?: string;
  visibility?: string;
};

const FILTERS: Array<{ key: RoomCategory; label: string }> = [
  { key: "all", label: "전체" },
  { key: "unread", label: "안 읽음" },
  { key: "group", label: "그룹" },
  { key: "fanclub", label: "팬클럽" },
  { key: "counseling", label: "고민상담" },
  { key: "friend_finding", label: "친구찾기" },
  { key: "meetup", label: "번개·만남" },
  { key: "casual", label: "잡담" },
  { key: "peer", label: "또래방" },
  { key: "karaoke", label: "노래방" },
];

const CATEGORY_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  fanclub: "heart",
  counseling: "coffee",
  friend_finding: "user-plus",
  meetup: "zap",
  casual: "message-circle",
  peer: "users",
  karaoke: "mic",
  growth_rpg: "compass",
  talk_battle: "radio",
};

function roomName(room: CategorizedRoom, myId?: string) {
  if (room.name?.trim()) return room.name.trim();
  if (room.type === "direct") {
    return userDisplayName(room.members?.find((member) => member.id !== myId), "채팅방");
  }
  return room.members?.map((member) => userDisplayName(member)).join(", ") || "그룹 채팅";
}

function roomAvatar(room: CategorizedRoom, myId?: string) {
  if (room.type !== "direct") return { uri: null, type: null };
  const other = room.members?.find((member) => member.id !== myId) as
    | (NonNullable<CategorizedRoom["members"]>[number] & {
        profile?: {
          profileImageUrl?: string | null;
          type?: string | null;
        } | null;
      })
    | undefined;
  // The legacy top-level field can contain the member's account photo. Chat is
  // character-scoped, so only render the explicitly resolved character image.
  return {
    uri: other?.profile?.profileImageUrl ?? null,
    type: other?.profile?.type ?? "fan",
  };
}

function formatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "어제";
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

function notificationCopy(type: string) {
  if (type === "profile.followed") {
    return { title: "새로운 팔로워", body: "새로운 사용자가 내 프로필을 팔로우했습니다." };
  }
  return { title: "운영 알림", body: "새로운 알림이 도착했습니다." };
}

export default function ChatsScreenV2() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: me } = useGetMe();
  const roomsQuery = useListRooms();
  const notificationQuery = useGetMyCharacterProfileNotifications();
  const rooms = (roomsQuery.data ?? []) as CategorizedRoom[];
  const notifications = notificationQuery.data?.items ?? [];
  const latestNotification = notifications[0];
  const unreadNotifications = notifications.filter((item) => !item.readAt).length;
  const [filter, setFilter] = React.useState<RoomCategory>("all");

  useFocusEffect(
    React.useCallback(() => {
      void Promise.all([roomsQuery.refetch(), notificationQuery.refetch()]);
    }, [notificationQuery.refetch, roomsQuery.refetch]),
  );

  React.useEffect(() => {
    const timer = setInterval(() => void roomsQuery.refetch(), 30_000);
    return () => clearInterval(timer);
  }, [roomsQuery.refetch]);

  const filteredRooms = React.useMemo(
    () =>
      rooms.filter((room) => {
        if (filter === "unread") return (room.unreadCount ?? 0) > 0;
        if (filter === "group") return room.type === "group";
        if (filter === "all") return true;
        return room.category === filter;
      }),
    [filter, rooms],
  );

  return (
    <NeonBackdrop style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>채팅</Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="친구 추가"
            hitSlop={10}
            onPress={() => router.push("/friends/add")}
            style={styles.headerButton}
          >
            <Feather name="user-plus" size={27} color="#F8F7FB" />
          </Pressable>
          <Pressable
            accessibilityLabel="친구 목록"
            hitSlop={10}
            onPress={() => router.push("/friends")}
            style={styles.headerButton}
          >
            <Feather name="users" size={28} color="#F8F7FB" />
          </Pressable>
          <Pressable
            accessibilityLabel="그룹 채팅 만들기"
            hitSlop={10}
            onPress={() => router.push("/group/create")}
            style={styles.headerButton}
          >
            <Feather name="edit-3" size={27} color="#F8F7FB" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        directionalLockEnabled
        nestedScrollEnabled
        decelerationRate="fast"
        alwaysBounceHorizontal={false}
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroller}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={[styles.filter, active && styles.filterActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={filteredRooms}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={roomsQuery.isRefetching}
            onRefresh={() => void Promise.all([roomsQuery.refetch(), notificationQuery.refetch()])}
            tintColor="#9D5CFF"
          />
        }
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          filter === "all" ? (
            <View style={styles.listHeader}>
              <Pressable
                onPress={() => router.push("/daily-talk-reward/generate" as never)}
                style={({ pressed }) => [styles.rewardBannerButton, pressed && styles.pressed]}
              >
                <Image
                  accessibilityLabel="톡투언, 대화를 나누면 STAR Point를 얻을 수 있어요"
                  resizeMode="cover"
                  source={require("@/assets/images/chat/talk-to-earn-star-point-banner.png")}
                  style={styles.rewardBannerImage}
                />
              </Pressable>

              {latestNotification ? (
                <Pressable
                  onPress={() => router.push("/settings/notifications")}
                  style={({ pressed }) => [styles.notificationCard, pressed && styles.pressed]}
                >
                  <View style={styles.notificationIcon}>
                    <Feather name="bell" size={23} color="#B56CFF" />
                  </View>
                  <View style={styles.notificationCopy}>
                    <Text style={styles.notificationTitle}>
                      {notificationCopy(latestNotification.type).title}
                    </Text>
                    <Text style={styles.notificationBody} numberOfLines={1}>
                      {notificationCopy(latestNotification.type).body}
                    </Text>
                  </View>
                  <Text style={styles.notificationTime}>
                    {formatTime(latestNotification.createdAt)}
                  </Text>
                  {unreadNotifications > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>
                        {unreadNotifications > 99 ? "99+" : unreadNotifications}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          roomsQuery.isLoading ? (
            <ActivityIndicator color="#9D5CFF" style={styles.loading} />
          ) : (
            <View style={styles.empty}>
              <Feather name="message-circle" size={34} color="#726C80" />
              <Text style={styles.emptyTitle}>표시할 채팅방이 없어요</Text>
              <Text style={styles.emptyBody}>
                {filter === "all"
                  ? "친구를 찾거나 새 그룹 채팅을 만들어보세요."
                  : "다른 분류를 선택해 채팅방을 확인해보세요."}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const name = roomName(item, me?.id);
          const avatar = roomAvatar(item, me?.id);
          const unread = item.unreadCount ?? 0;
          const icon = CATEGORY_ICON[item.category ?? ""] ?? "users";
          return (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: item.type === "battle" ? "/battle/[id]" : "/chat/[id]",
                  params: { id: item.id },
                })
              }
              style={({ pressed }) => [styles.roomCard, pressed && styles.pressed]}
            >
              {item.type === "direct" ? (
                <Avatar
                  uri={avatar.uri}
                  name={name}
                  size={58}
                  crop="face"
                  characterType={avatar.type}
                />
              ) : (
                <View style={styles.roomIcon}>
                  <Feather name={icon} size={26} color="#A85CFF" />
                </View>
              )}
              <View style={styles.roomCopy}>
                <Text style={styles.roomName} numberOfLines={1}>{name}</Text>
                <Text style={styles.roomPreview} numberOfLines={1}>
                  {item.lastMessage || "아직 메시지가 없습니다."}
                </Text>
              </View>
              <View style={styles.roomMeta}>
                <Text style={styles.roomTime}>{formatTime(item.lastMessageAt)}</Text>
                {unread > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{unread > 99 ? "99+" : unread}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </NeonBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#03030A" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  title: { color: "#FFFFFF", fontSize: 31, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 17 },
  headerButton: { width: 30, height: 38, alignItems: "center", justifyContent: "center" },
  filterScroller: {
    flexGrow: 0,
    flexShrink: 0,
    width: "100%",
    height: 62,
  },
  filters: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 9,
  },
  filter: {
    height: 42,
    paddingHorizontal: 20,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D0C16",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.025)",
  },
  filterActive: {
    backgroundColor: "#8D43FA",
    borderColor: "#B26BFF",
    shadowColor: "#7D2DFF",
    shadowOpacity: 0.55,
    shadowRadius: 12,
  },
  filterText: { color: "#A6A1AE", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  filterTextActive: { color: "#FFFFFF" },
  list: { paddingHorizontal: 16, paddingBottom: 130, flexGrow: 1 },
  listHeader: { gap: 13, marginBottom: 4 },
  rewardBannerButton: {
    width: "100%",
    aspectRatio: 2.72,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#160A31",
  },
  rewardBannerImage: {
    width: "100%",
    height: "100%",
  },
  notificationCard: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(111,80,160,0.26)",
    backgroundColor: "rgba(13,12,24,0.96)",
  },
  notificationIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#261344",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationCopy: { flex: 1, paddingHorizontal: 14, gap: 4 },
  notificationTitle: { color: "#F5F2FA", fontSize: 17, fontFamily: "Inter_600SemiBold" },
  notificationBody: { color: "#918B9B", fontSize: 13, fontFamily: "Inter_400Regular" },
  notificationTime: { color: "#8C8694", fontSize: 12 },
  roomCard: {
    minHeight: 96,
    marginTop: 12,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "rgba(102,75,145,0.22)",
    backgroundColor: "rgba(12,11,22,0.96)",
  },
  roomIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#281442",
    alignItems: "center",
    justifyContent: "center",
  },
  roomCopy: { flex: 1, paddingHorizontal: 15, gap: 6 },
  roomName: { color: "#F8F6FA", fontSize: 19, fontFamily: "Inter_600SemiBold" },
  roomPreview: { color: "#9B96A3", fontSize: 14, fontFamily: "Inter_400Regular" },
  roomMeta: { height: 56, justifyContent: "space-between", alignItems: "flex-end" },
  roomTime: { color: "#8F8998", fontSize: 12 },
  unreadBadge: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 8,
    backgroundColor: "#7C2EFF",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Inter_700Bold" },
  loading: { marginTop: 50 },
  empty: { alignItems: "center", paddingVertical: 58, gap: 10 },
  emptyTitle: { color: "#CBC6D0", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyBody: { color: "#76717D", fontSize: 13, textAlign: "center" },
  pressed: { opacity: 0.72 },
});
