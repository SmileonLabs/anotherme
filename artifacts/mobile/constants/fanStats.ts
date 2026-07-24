import type { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";

export type FanStatKey = "fanPower" | "supportPower" | "empathy" | "story";

export const FAN_STAT_META: Array<{
  key: FanStatKey;
  label: string;
  icon: ComponentProps<typeof Feather>["name"];
  color: string;
}> = [
  { key: "fanPower", label: "매력", icon: "heart", color: "#F062D7" },
  { key: "supportPower", label: "응원력", icon: "volume-2", color: "#20E4E5" },
  { key: "empathy", label: "유대감", icon: "message-circle", color: "#39D9FF" },
  { key: "story", label: "영향력", icon: "award", color: "#F6C733" },
];

const LEGACY_TO_PROFILE_KEY: Record<FanStatKey, string> = {
  fanPower: "charm",
  supportPower: "supportPower",
  empathy: "bond",
  story: "influence",
};

export function readFanStat(
  stats: Record<string, number> | null | undefined,
  key: FanStatKey,
): number {
  const value = stats?.[key] ?? stats?.[LEGACY_TO_PROFILE_KEY[key]] ?? 0;
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
