import type { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";

export type FanStatKey = "fanPower" | "supportPower" | "empathy" | "story";

export const FAN_STAT_META: Array<{
  key: FanStatKey;
  label: string;
  icon: ComponentProps<typeof Feather>["name"];
  color: string;
}> = [
  { key: "fanPower", label: "팬심", icon: "star", color: "#A78BFA" },
  { key: "supportPower", label: "응원력", icon: "volume-2", color: "#38BDF8" },
  { key: "empathy", label: "공감력", icon: "message-circle", color: "#5EEAD4" },
  { key: "story", label: "스토리", icon: "book-open", color: "#FACC15" },
];
