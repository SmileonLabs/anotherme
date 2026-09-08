import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { useBibiOfficial, useOpenBibiOfficialRoom } from "@/hooks/useBibiOfficial";
import { useColors } from "@/hooks/useColors";
import { crossAlert } from "@/lib/crossAlert";

interface Props {
  onOpenRoom: (roomId: string) => void;
}

export function BibiOfficialEntry({ onOpenRoom }: Props) {
  const colors = useColors();
  const { data: account } = useBibiOfficial();
  const openRoom = useOpenBibiOfficialRoom();
  const displayName = account?.displayName ?? "BIBI Official";
  const handle = account?.handle ?? "@bibi_official";

  const handlePress = async () => {
    if (openRoom.isPending) return;
    try {
      const result = await openRoom.mutateAsync();
      onOpenRoom(result.room.id);
    } catch {
      crossAlert("오류", "BIBI Official 대화방을 열지 못했습니다. 다시 시도해주세요.");
    }
  };

  return (
    <Pressable
      onPress={() => void handlePress()}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.72 : 1 },
      ]}
    >
      <Avatar
        uri={account?.profileImageUrl ?? null}
        name={displayName}
        size={42}
        crop="face"
        characterType="official_ai"
      />
      <View style={styles.copy}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{displayName}</Text>
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>Official</Text>
          </View>
        </View>
        <Text style={[styles.handle, { color: colors.primary }]} numberOfLines={1}>{handle}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={2}>
          AI 라벨이 표시된 BIBI Official persona 응답을 받아요.
        </Text>
      </View>
      {openRoom.isPending ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Feather name="message-circle" size={21} color={colors.primary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    padding: 14,
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  nameRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  name: { flexShrink: 1, fontFamily: "Inter_700Bold", fontSize: 15 },
  badge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 10 },
  handle: { fontFamily: "Inter_700Bold", fontSize: 12 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
});
