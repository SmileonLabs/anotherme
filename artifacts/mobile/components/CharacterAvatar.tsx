import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useMediaUri } from "@/hooks/useMediaUri";
import { parseAvatarRecipe } from "@/lib/avatarAssets";

interface CharacterAvatarProps {
  uri?: string | null;
  fallbackSource?: number;
  crop?: "face" | "full";
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
}

/** Renders one persisted avatar recipe identically on web, iOS and Android. */
export function CharacterAvatar({
  uri,
  fallbackSource,
  crop = "full",
  style,
  borderRadius = 0,
}: CharacterAvatarProps) {
  const recipe = React.useMemo(() => parseAvatarRecipe(uri), [uri]);
  const remoteUri = useMediaUri(recipe ? null : uri);
  const sources = recipe?.sources ?? (remoteUri ? [{ uri: remoteUri }] : fallbackSource ? [fallbackSource] : []);
  const layerStyle = crop === "face" ? styles.faceLayer : styles.fullLayer;
  return (
    <View style={[styles.container, { borderRadius }, style]}>
      {sources.map((source, index) => (
        <Image
          key={recipe?.keys[index] ?? `${remoteUri ?? "fallback"}-${index}`}
          source={source}
          style={layerStyle}
          contentFit={crop === "face" ? "contain" : "contain"}
          contentPosition={crop === "face" ? "top center" : "bottom center"}
          transition={index === 0 ? 120 : 0}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: "hidden", backgroundColor: "#05050A" },
  fullLayer: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  faceLayer: {
    position: "absolute",
    width: "170%",
    height: "243%",
    left: "-35%",
    top: "-24%",
  },
});
