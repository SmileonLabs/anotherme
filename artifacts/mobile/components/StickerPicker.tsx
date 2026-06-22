import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { STICKER_CODES } from "@/constants/stickers";
import { StickerImage } from "./StickerImage";
import { useColors } from "@/hooks/useColors";

interface StickerPickerProps {
  onSelect: (code: string) => void;
}

export function StickerPicker({ onSelect }: StickerPickerProps) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.card, borderTopColor: colors.border },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {STICKER_CODES.map((code) => (
          <Pressable
            key={code}
            onPress={() => onSelect(code)}
            style={({ pressed }) => [styles.cell, { opacity: pressed ? 0.5 : 1 }]}
            hitSlop={4}
          >
            <StickerImage code={code} size={58} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 240,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 6,
    justifyContent: "space-between",
  },
  cell: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
});
