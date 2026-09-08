import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, StyleSheet, Text, View, type PressableProps, type ViewProps } from "react-native";

import { neon } from "@/constants/colors";

export function NeonBackdrop({ children, style, ...props }: ViewProps) {
  return (
    <View {...props} style={[styles.backdrop, style]}>
      <View pointerEvents="none" style={[styles.orb, styles.orbTop]} />
      <View pointerEvents="none" style={[styles.orb, styles.orbBottom]} />
      {children}
    </View>
  );
}

export function NeonCard({ children, style, ...props }: ViewProps) {
  return <View {...props} style={[styles.card, style]}>{children}</View>;
}

export function NeonButton({ children, style, ...props }: PressableProps) {
  return (
    <Pressable
      {...props}
      style={(state) => [
        styles.buttonWrap,
        state.pressed && styles.pressed,
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {(state) => (
        <LinearGradient colors={["#A64DFF", "#4C28E6"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.button}>
          {typeof children === "function" ? children(state) : typeof children === "string" ? <Text style={styles.buttonText}>{children}</Text> : children}
        </LinearGradient>
      )}
    </Pressable>
  );
}

export function NeonSectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: neon.background, overflow: "hidden" },
  orb: { position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: neon.glow, opacity: 0.16 },
  orbTop: { right: -150, top: -110 },
  orbBottom: { left: -170, bottom: 60 },
  card: { backgroundColor: neon.panelSoft, borderWidth: 1, borderColor: neon.line, borderRadius: 20, padding: 16 },
  buttonWrap: { borderRadius: 999, overflow: "hidden" },
  button: { minHeight: 44, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 14 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  sectionHeader: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: neon.text, fontFamily: "Inter_700Bold", fontSize: 18 },
});
