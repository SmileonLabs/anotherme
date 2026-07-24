import { useLocalSearchParams } from "expo-router";
import React from "react";
import { PublicCharacterProfileScreen } from "@/components/PublicCharacterProfileScreen";

export default function CharacterProfileTabScreen() {
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  return <PublicCharacterProfileScreen profileId={profileId ?? ""} />;
}
