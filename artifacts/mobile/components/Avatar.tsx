import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { mediaUri } from "@/lib/apiBase";

interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
}

export function Avatar({ uri, name, size = 44 }: AvatarProps) {
  const colors = useColors();
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const fontSize = size * 0.38;

  if (uri) {
    return (
      <Image
        source={{ uri: mediaUri(uri) }}
        style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        contentFit="cover"
      />
    );
  }

  const seed = name.charCodeAt(0) % avatarColors.length;
  const bg = avatarColors[seed];

  return (
    <View
      style={[
        styles.placeholder,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
    >
      <Text style={[styles.initials, { fontSize, color: "#FFFFFF" }]}>{initials}</Text>
    </View>
  );
}

const avatarColors = [
  "#5B6EE8",
  "#9B59B6",
  "#E91E8C",
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#F7DC6F",
  "#E74C3C",
  "#2ECC71",
];

const styles = StyleSheet.create({
  image: {
    backgroundColor: "#E5E5EA",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontFamily: "Inter_600SemiBold",
  },
});
