import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View } from "react-native";
import { mediaUri } from "@/lib/apiBase";

interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
}

/** Default animal avatars bundled in assets, used when a user has no profile image. */
const DEFAULT_AVATARS = [
  require("../assets/images/avatars/bear.png"),
  require("../assets/images/avatars/cockatoo.png"),
  require("../assets/images/avatars/falcon.png"),
  require("../assets/images/avatars/horse.png"),
  require("../assets/images/avatars/lion.png"),
  require("../assets/images/avatars/lizard.png"),
  require("../assets/images/avatars/moose.png"),
  require("../assets/images/avatars/squirrel.png"),
  require("../assets/images/avatars/turtle.png"),
  require("../assets/images/avatars/wolf.png"),
];

/** Deterministic pick so the same user always gets the same default avatar. */
function defaultAvatarFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return DEFAULT_AVATARS[hash % DEFAULT_AVATARS.length];
}

export function Avatar({ uri, name, size = 44 }: AvatarProps) {
  if (uri) {
    return (
      <Image
        source={{ uri: mediaUri(uri) }}
        style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        contentFit="cover"
      />
    );
  }

  return (
    <View style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={defaultAvatarFor(name)}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: "#E5E5EA",
    overflow: "hidden",
  },
});
