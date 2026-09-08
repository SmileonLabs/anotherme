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
    text: "#F7F5FF",
    tint: "#B76CFF",

    background: "#04040B",
    foreground: "#F7F5FF",

    card: "#0F0F1B",
    cardForeground: "#F7F5FF",

    primary: "#9D63FF",
    primaryForeground: "#FFFFFF",

    secondary: "#171126",
    secondaryForeground: "#F7F5FF",

    muted: "#080812",
    mutedForeground: "#A9A3BA",

    accent: "#211236",
    accentForeground: "#C892FF",

    destructive: "#FF453A",
    destructiveForeground: "#FFFFFF",

    border: "#392354",
    input: "#11101D",

    myBubble: "#7137D8",
    myBubbleText: "#FFFFFF",
    otherBubble: "#151320",
    otherBubbleText: "#F7F5FF",

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
  cta: ["#B357FF", "#5226E8"] as const,
  /** Deep lavender surface for highlighted cards (dark mode). */
  soft: ["#171126", "#10152A"] as const,
};

/** Neon surfaces shared by the mockup-inspired mobile and PWA UI. */
export const neon = {
  background: "#04040B",
  panel: "rgba(15, 15, 27, 0.94)",
  panelSoft: "rgba(17, 16, 31, 0.86)",
  line: "rgba(157, 99, 255, 0.42)",
  glow: "rgba(136, 74, 255, 0.42)",
  purple: "#9D63FF",
  magenta: "#F04CCB",
  cyan: "#35E6E0",
  blue: "#526DFF",
  gold: "#FFD84D",
  text: "#F7F5FF",
  muted: "#A9A3BA",
} as const;

export default colors;
