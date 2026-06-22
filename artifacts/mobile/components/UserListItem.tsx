import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Avatar } from "./Avatar";
import { useColors } from "@/hooks/useColors";

interface UserListItemProps {
  name: string;
  subtitle?: string;
  avatarUri?: string | null;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  showChevron?: boolean;
}

export function UserListItem({
  name,
  subtitle,
  avatarUri,
  onPress,
  rightElement,
  showChevron = false,
}: UserListItemProps) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.background, opacity: pressed ? 0.7 : 1 },
      ]}
      onPress={onPress}
    >
      <Avatar uri={avatarUri} name={name} size={48} />
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightElement}
      {showChevron && (
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
