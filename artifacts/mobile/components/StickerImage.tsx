import React, { useState } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { stickerUri } from "@/constants/stickers";

interface StickerImageProps {
  code: string;
  size: number;
}

/**
 * Renders a single animated sticker (Noto Animated Emoji, animated WebP) via
 * expo-image, which auto-plays animated images on both web and native.
 *
 * If the sticker fails to load (e.g. an unknown/legacy codepoint that no longer
 * resolves on the CDN), fall back to a neutral placeholder instead of an empty
 * gap so the message bubble still reads as a sticker.
 */
export function StickerImage({ code, size }: StickerImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View
        style={{
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: size * 0.6 }}>🙂</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: stickerUri(code) }}
      style={{ width: size, height: size }}
      contentFit="contain"
      transition={120}
      cachePolicy="memory-disk"
      onError={() => setFailed(true)}
    />
  );
}
