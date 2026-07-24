import { useLocalSearchParams } from "expo-router";
import React from "react";
import { PublicCharacterProfileScreen } from "@/components/PublicCharacterProfileScreen";

/**
 * Keep legacy deep links on the same canonical character profile screen used
 * by the tab route. Maintaining a second renderer caused account-photo
 * fallbacks and UI behavior to diverge by navigation path.
 */
export default function LegacyCharacterProfileRoute() {
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  return <PublicCharacterProfileScreen profileId={profileId ?? ""} />;
}
