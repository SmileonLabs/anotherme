import { Redirect } from "expo-router";

/**
 * Legacy route kept only for old bookmarks and cached deep links.
 * New and existing authenticated users now enter the app directly.
 */
export default function LegacyOnboardingRedirect() {
  return <Redirect href="/(tabs)" />;
}
