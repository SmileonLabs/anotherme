const colors = {
  light: {
    text: "#1A1A2E",
    tint: "#5B6EE8",

    background: "#FFFFFF",
    foreground: "#1A1A2E",

    card: "#F8F8FF",
    cardForeground: "#1A1A2E",

    primary: "#5B6EE8",
    primaryForeground: "#FFFFFF",

    secondary: "#F0F1FD",
    secondaryForeground: "#1A1A2E",

    muted: "#F5F5FA",
    mutedForeground: "#8E8E93",

    accent: "#EEF0FD",
    accentForeground: "#5B6EE8",

    destructive: "#FF3B30",
    destructiveForeground: "#FFFFFF",

    border: "#E5E5EA",
    input: "#F2F2F7",

    myBubble: "#5B6EE8",
    myBubbleText: "#FFFFFF",
    otherBubble: "#F0F1FD",
    otherBubbleText: "#1A1A2E",

    destructiveMuted: "#FFEAE8",

    online: "#34C759",
  },
  dark: {
    text: "#ECECF1",
    tint: "#8A97FF",

    background: "#15151D",
    foreground: "#ECECF1",

    card: "#1C1C27",
    cardForeground: "#ECECF1",

    primary: "#6E7CF0",
    primaryForeground: "#FFFFFF",

    secondary: "#23232F",
    secondaryForeground: "#ECECF1",

    muted: "#0E0E14",
    mutedForeground: "#9A9AA7",

    accent: "#23253A",
    accentForeground: "#9AA6FF",

    destructive: "#FF453A",
    destructiveForeground: "#FFFFFF",

    border: "#2C2C38",
    input: "#20202B",

    myBubble: "#5B6EE8",
    myBubbleText: "#FFFFFF",
    otherBubble: "#23232F",
    otherBubbleText: "#ECECF1",

    destructiveMuted: "#3A1F1F",

    online: "#30D158",
  },
  radius: 12,
};

/** Reusable gradient ramps (tuples typed for expo-linear-gradient). */
export const gradients = {
  /** Primary call-to-action button. */
  cta: ["#7B88F5", "#5B6EE8"] as const,
  /** Soft lavender surface for highlighted cards (light mode). */
  soft: ["#EEF0FE", "#F2ECFF"] as const,
};

/** Dark-mode counterparts of {@link gradients}. */
export const gradientsDark = {
  cta: ["#6E7CF0", "#5B6EE8"] as const,
  /** Deep lavender surface for highlighted cards (dark mode). */
  soft: ["#23253A", "#2A2440"] as const,
};

export default colors;
