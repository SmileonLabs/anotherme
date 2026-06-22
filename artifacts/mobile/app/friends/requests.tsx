import { CustomSectionList } from "@/components/CustomScroll";
import React, { useEffect } from "react";
import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  useListIncomingFriendRequests,
  useListOutgoingFriendRequests,
  useAcceptFriendRequest,
  useRejectFriendRequest,
} from "@workspace/api-client-react";
import { crossAlert } from "@/lib/crossAlert";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { useColors } from "@/hooks/useColors";

export default function RequestsScreen() {
  const colors = useColors();
  const {
    data: incoming = [],
    refetch: refetchIn,
    isRefetching: refreshingIn,
  } = useListIncomingFriendRequests();
  const {
    data: outgoing = [],
    refetch: refetchOut,
    isRefetching: refreshingOut,
  } = useListOutgoingFriendRequests();

  const accept = useAcceptFriendRequest();
  const reject = useRejectFriendRequest();

  useEffect(() => {
    const timer = setInterval(() => { refetchIn(); refetchOut(); }, 10000);
    return () => clearInterval(timer);
  }, [refetchIn, refetchOut]);

  const handleAccept = async (id: string, name: string) => {
    await accept.mutateAsync({ id });
    refetchIn();
    crossAlert("수락됨", `${name}님과 친구가 되었습니다`);
  };

  const handleReject = (id: string) => {
    crossAlert("거절", "친구 요청을 거절하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "거절",
        style: "destructive",
        onPress: async () => {
          await reject.mutateAsync({ id });
          refetchIn();
        },
      },
    ]);
  };

  const sections = [
    {
      title: `받은 요청 (${incoming.length})`,
      data: incoming,
      isIncoming: true,
    },
    {
      title: `보낸 요청 (${outgoing.length})`,
      data: outgoing,
      isIncoming: false,
    },
  ];

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <EmptyState
        icon="bell"
        title="친구 요청이 없습니다"
        subtitle="친구 추가 화면에서 친구를 검색해보세요"
      />
    );
  }

  return (
    <CustomSectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshingIn || refreshingOut}
          onRefresh={() => { refetchIn(); refetchOut(); }}
          tintColor={colors.primary}
        />
      }
      renderSectionHeader={({ section }) => (
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>
          {section.title}
        </Text>
      )}
      renderItem={({ item, section }) => {
        const user = (item as any).user;
        if (!user) return null;
        return (
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Avatar uri={user.profileImageUrl} name={user.nickname} size={48} />
            <View style={styles.info}>
              <Text style={[styles.name, { color: colors.foreground }]}>{user.nickname}</Text>
              <Text style={[styles.email, { color: colors.mutedForeground }]}>{user.email}</Text>
            </View>
            {(section as any).isIncoming ? (
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.acceptBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                  onPress={() => handleAccept(item.id, user.nickname)}
                >
                  <Text style={styles.btnText}>수락</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.rejectBtn, { backgroundColor: colors.muted, opacity: pressed ? 0.8 : 1 }]}
                  onPress={() => handleReject(item.id)}
                >
                  <Text style={[styles.btnText, { color: colors.destructive }]}>거절</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={[styles.pending, { color: colors.mutedForeground }]}>대기 중</Text>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 40 },
  sectionHeader: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontFamily: "Inter_500Medium" },
  email: { fontSize: 12, fontFamily: "Inter_400Regular" },
  actions: { flexDirection: "row", gap: 8 },
  acceptBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  rejectBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  pending: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
