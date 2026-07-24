import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useMediaUri } from "@/hooks/useMediaUri";

interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
  crop?: "default" | "face";
  characterType?: "fan" | "star" | "official_ai" | string | null;
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

const FAN_CHARACTER = require("../assets/images/home-v2/fan-character-scene.png");
const STAR_CHARACTER = require("../assets/images/star-character-cutout.png");

/** Deterministic pick so the same user always gets the same default avatar. */
function defaultAvatarFor(name: string) {
  const safe = name || "?";
  let hash = 0;
  for (let i = 0; i < safe.length; i++) {
    hash = (hash * 31 + safe.charCodeAt(i)) >>> 0;
  }
  return DEFAULT_AVATARS[hash % DEFAULT_AVATARS.length];
}

function characterFallback(type?: AvatarProps["characterType"]) {
  if (type === "fan") return FAN_CHARACTER;
  if (type === "star") return STAR_CHARACTER;
  return null;
}

export function Avatar({
  uri,
  name,
  size = 44,
  crop = "default",
  characterType,
}: AvatarProps) {
  const resolvedUri = useMediaUri(uri);
  // Legacy production responses do not always include the character type.
  // Public member surfaces are FAN-scoped by default; STAR/official callers
  // must opt in explicitly. This prevents an omitted type from re-enabling the
  // old account-photo URL.
  const effectiveCharacterType = characterType ?? "fan";
  const fallback = characterFallback(effectiveCharacterType);
  // FAN identity screens must not render a legacy account photo. Older data
  // copied users.profile_image_url into character_profiles, so even cached or
  // not-yet-migrated API responses are safely converted to the FAN character.
  const displayUri = effectiveCharacterType === "fan" ? null : resolvedUri;
  const shouldCropFace = crop === "face" || !!fallback;
  if (displayUri) {
    return (
      <View style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}>
        <Image
          source={{ uri: displayUri }}
          style={
            shouldCropFace
              ? {
                  position: "absolute",
                  width: size * 1.7,
                  height: size * 1.7,
                  left: -size * 0.35,
                  top: 0,
                }
              : StyleSheet.absoluteFill
          }
          contentFit="cover"
          contentPosition={shouldCropFace ? "top center" : "center"}
        />
      </View>
    );
  }

  const fallbackSource = fallback ?? defaultAvatarFor(name);
  return (
    <View style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={fallbackSource}
        style={
          fallback
            ? {
                position: "absolute",
                width: size * 1.7,
                height: size * 1.7,
                left: -size * 0.35,
                top: 0,
              }
            : { width: size, height: size, borderRadius: size / 2 }
        }
        contentFit="cover"
        contentPosition={fallback ? "top center" : "center"}
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
