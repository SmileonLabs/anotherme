export const FAN_EXPANSION_LEVEL = 50;

export type FanCreationCandidate = {
  level: number;
  status: "active" | "locked" | "torimia" | "archived";
};

export function canCreateAdditionalFan(profiles: FanCreationCandidate[]): boolean {
  if (profiles.length === 0) return true;
  return profiles.some(
    (profile) => profile.status === "torimia" || profile.level >= FAN_EXPANSION_LEVEL,
  );
}

export function canArchiveCharacterProfile(nonArchivedProfileCount: number): boolean {
  return nonArchivedProfileCount > 1;
}

export function normalizeProfileHandle(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}
