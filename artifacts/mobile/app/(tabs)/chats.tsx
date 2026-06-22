import { CustomFlatList } from "@/components/CustomScroll";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGetMe, useListRooms } from "@workspace/api-client-react";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";
import { gradients } from "@/constants/colors";

type Filter = "all" | "unread" | "group" | "dungeon" | "battle";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "unread", label: "안 읽음" },
  { key: "group", label: "그룹" },
  { key: "dungeon", label: "던전" },
  { key: "battle", label: "토크배틀" },
];

function getRoomDisplayName(room: any, myId?: string): string {
  if (room.name) return room.name;
  if (room.type === "direct") {
    const other = room.members?.find((m: any) => m.id !== myId);
    return other?.nickname ?? "채팅방";
  }
  return room.members?.map((m: any) => m.nickname).join(", ") ?? "그룹 채팅";
}

function getRoomAvatar(room: any, myId?: string) {
  if (room.type === "direct") {
    const other = room.members?.find((m: any) => m.id !== myId);
    return other?.profileImageUrl ?? null;
  }
  return null;
}

function formatTime(dateStr?: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

export default function ChatsScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: me } = useGetMe();
  const { data: rooms = [], isLoading, refetch, isRefetching } = useListRooms();
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const timer = setInterval(() => refetch(), 5000);
    return () => clearInterval(timer);
  }, [refetch]);

  // Refetch every time the list regains focus (e.g. returning from a chat after
  // reading it). The room screen advances the server read pointer, but if this
  // tab was unmounted/blurred its 5s interval wasn't running, so the cached
  // unread badge would linger until the next poll. Pulling fresh data on focus
  // makes the badge reflect server truth immediately on return.
  useFocusEffect(
    React.useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const filteredRooms = rooms.filter((r) => {
    if (filter === "unread") return (r.unreadCount ?? 0) > 0;
    if (filter === "group") return r.type === "group";
    if (filter === "dungeon") return r.type === "dungeon";
    if (filter === "battle") return r.type === "battle";
    return true;
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>채팅</Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="새 토크배틀"
            hitSlop={8}
            onPress={() => router.push("/battle/create")}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Feather name="mic" size={22} color={colors.primary} />
          </Pressable>
          <Pressable
            accessibilityLabel="새 던전"
            hitSlop={8}
            onPress={() => router.push("/dungeon/create")}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Feather name="compass" size={22} color={colors.primary} />
          </Pressable>
          <Pressable
            accessibilityLabel="새 그룹 채팅"
            hitSlop={8}
            onPress={() => router.push("/group/create")}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <Feather name="users" size={22} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.muted,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? "#fff" : colors.mutedForeground },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <CustomFlatList
        data={filteredRooms}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          filteredRooms.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon="message-circle"
              title={
                filter === "unread"
                  ? "안 읽은 채팅이 없습니다"
                  : filter === "group"
                    ? "그룹 채팅이 없습니다"
                    : "채팅방이 없습니다"
              }
              subtitle={filter === "all" ? "친구와 대화를 시작해보세요" : undefined}
            />
          ) : null
        }
        renderItem={({ item }) => {
          const name = getRoomDisplayName(item, me?.id);
          const avatarUri = getRoomAvatar(item, me?.id);
          const unread = item.unreadCount ?? 0;
          return (
            <Pressable
              style={({ pressed }) => [
                styles.roomItem,
                { backgroundColor: colors.background, opacity: pressed ? 0.6 : 1 },
              ]}
              onPress={() =>
                router.push(
                  item.type === "battle"
                    ? { pathname: "/battle/[id]", params: { id: item.id } }
                    : { pathname: "/chat/[id]", params: { id: item.id } },
                )
              }
            >
              {item.type === "battle" ? (
                <View style={[styles.groupAvatar, { backgroundColor: colors.accent }]}>
                  <Feather name="mic" size={22} color={colors.primary} />
                </View>
              ) : item.type === "dungeon" ? (
                <View style={[styles.groupAvatar, { backgroundColor: colors.accent }]}>
                  <Feather name="compass" size={22} color={colors.primary} />
                </View>
              ) : item.type === "group" && !avatarUri ? (
                <View style={[styles.groupAvatar, { backgroundColor: colors.accent }]}>
                  <Feather name="users" size={22} color={colors.primary} />
                </View>
              ) : (
                <Avatar uri={avatarUri} name={name} size={54} />
              )}
              <View style={styles.roomInfo}>
                <View style={styles.roomTop}>
                  <Text style={[styles.roomName, { color: colors.foreground }]} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={[styles.roomTime, { color: colors.mutedForeground }]}>
                    {formatTime(item.lastMessageAt)}
                  </Text>
                </View>
                <View style={styles.roomBottom}>
                  <Text
                    style={[styles.lastMessage, { color: colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    {item.lastMessage ?? "아직 메시지가 없습니다"}
                  </Text>
                  {unread > 0 ? (
                    <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
        )}
      />

      {/* Floating compose button */}
      <Pressable
        accessibilityLabel="새 그룹 채팅"
        onPress={() => router.push("/group/create")}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 92, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        <LinearGradient
          colors={gradients.cta}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <Feather name="edit-2" size={22} color="#fff" />
        </LinearGradient>
      </Pressable>
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
  title: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { padding: 6 },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },
  chip: {
    paddingHorizontal: 16,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  listContent: { paddingBottom: 120 },
  emptyContainer: { flexGrow: 1, minHeight: 400 },
  roomItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  groupAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  roomInfo: { flex: 1, gap: 4 },
  roomTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roomName: { fontSize: 16, fontFamily: "Inter_600SemiBold", flex: 1, marginRight: 8 },
  roomTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  roomBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lastMessage: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1, marginRight: 8 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#fff" },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 82 },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: "#5B6EE8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
