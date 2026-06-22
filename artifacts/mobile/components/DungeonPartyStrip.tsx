import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { DungeonState } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useShakeStyle } from "@/hooks/useShake";

type Char = DungeonState["party"][number];
type Enemy = DungeonState["enemies"][number];
type Goal = DungeonState["goals"][number];

const POINTS_GOLD = "#F0B429";

function hpColor(ratio: number) {
  if (ratio > 0.5) return "#34C759";
  if (ratio > 0.25) return "#FF9500";
  return "#FF3B30";
}

// Pulses the points badge whenever the score changes so a gain/loss is felt,
// not just silently updated.
function PointsBadge({ points }: { points: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const prev = useRef(points);
  useEffect(() => {
    if (prev.current !== points) {
      prev.current = points;
      scale.setValue(1);
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.35, duration: 140, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
  }, [points, scale]);
  return (
    <Animated.View style={[styles.pointsBadge, { transform: [{ scale }] }]}>
      <Text style={[styles.pointsText, { color: POINTS_GOLD }]} numberOfLines={1}>
        ⭐ {points.toLocaleString()}
      </Text>
    </Animated.View>
  );
}

// Drains/refills the HP fill smoothly instead of snapping. The bar instance is
// keyed by combatant identity in the lists above, so across turns the same bar
// animates from its previous ratio to the new one — making the "energy 차감"
// land together with the strike feedback instead of jumping instantly.
function AnimatedHpBar({ ratio, color, track }: { ratio: number; color: string; track: string }) {
  const w = useRef(new Animated.Value(ratio)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: ratio, duration: 450, useNativeDriver: false }).start();
  }, [ratio, w]);
  const width = w.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });
  return (
    <View style={[styles.barTrack, { backgroundColor: track }]}>
      <Animated.View style={[styles.barFill, { width, backgroundColor: color }]} />
    </View>
  );
}

export function DungeonPartyStrip({
  data,
  enemyShakeToken,
}: {
  data: DungeonState | undefined;
  enemyShakeToken?: number;
}) {
  const colors = useColors();
  const enemyShake = useShakeStyle(enemyShakeToken);
  const [goalsOpen, setGoalsOpen] = useState(true);

  if (!data) return null;

  const enemies = data.enemies ?? [];
  const goals = data.goals ?? [];
  const goalsDone = goals.filter((g) => g.done).length;

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.card, borderBottomColor: colors.border },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.scene, { color: colors.foreground }]} numberOfLines={1}>
          📍 {data.scene}
        </Text>
        <View style={styles.headerRight}>
          <PointsBadge points={data.points ?? 0} />
          {data.ended ? (
            <Text style={[styles.ended, { color: colors.destructive }]}>모험 종료</Text>
          ) : (
            <Text style={[styles.turn, { color: colors.mutedForeground }]}>턴 {data.turn}</Text>
          )}
        </View>
      </View>

      {goals.length > 0 ? (
        <View
          style={[
            styles.goalsPanel,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Pressable
            style={styles.goalsHeader}
            onPress={() => setGoalsOpen((o) => !o)}
            hitSlop={6}
          >
            <Text style={[styles.goalsTitle, { color: colors.foreground }]} numberOfLines={1}>
              🎯 미션 {goalsDone}/{goals.length}
            </Text>
            <Feather
              name={goalsOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.mutedForeground}
            />
          </Pressable>
          {goalsOpen ? (
            <View style={styles.goalsList}>
              {goals.map((g: Goal, i: number) => {
                const isMain = g.kind === "main";
                const mark = g.done ? "✓" : isMain ? "🎯" : "•";
                const markColor = g.done ? "#34C759" : isMain ? POINTS_GOLD : colors.mutedForeground;
                return (
                  <View key={`${i}-${g.text}`} style={styles.goalRow}>
                    <Text style={[styles.goalMark, { color: markColor }]}>{mark}</Text>
                    <Text
                      style={[
                        isMain ? styles.goalMainText : styles.goalSubText,
                        {
                          color: g.done ? colors.mutedForeground : colors.foreground,
                          textDecorationLine: g.done ? "line-through" : "none",
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {g.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {enemies.length > 0 || data.party.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.partyRow}
        >
          {enemies.map((e: Enemy, i: number) => {
            const ratio = e.maxHp > 0 ? Math.max(0, e.hp) / e.maxHp : 0;
            return (
              <Animated.View
                key={`enemy-${e.name}-${i}`}
                style={[
                  styles.enemyCard,
                  enemyShake,
                  { backgroundColor: colors.destructive + "1A", borderColor: colors.destructive + "55" },
                ]}
              >
                <Text style={[styles.name, { color: colors.destructive }]} numberOfLines={1}>
                  ⚔️ {e.name}
                </Text>
                <AnimatedHpBar ratio={ratio} color="#FF3B30" track={colors.border} />
                <Text style={[styles.hp, { color: colors.mutedForeground }]} numberOfLines={1}>
                  HP {Math.max(0, e.hp)}/{e.maxHp}
                </Text>
              </Animated.View>
            );
          })}
          {data.party.map((c: Char) => {
            const ratio = c.maxHp > 0 ? Math.max(0, c.hp) / c.maxHp : 0;
            return (
              <View key={c.userId} style={[styles.card, { backgroundColor: colors.muted }]}>
                <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                  {c.name}
                </Text>
                <AnimatedHpBar ratio={ratio} color={hpColor(ratio)} track={colors.border} />
                <Text style={[styles.hp, { color: colors.mutedForeground }]} numberOfLines={1}>
                  HP {Math.max(0, c.hp)}/{c.maxHp} · {c.status}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    gap: 8,
  },
  scene: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  turn: { fontSize: 12, fontFamily: "Inter_500Medium" },
  ended: { fontSize: 12, fontFamily: "Inter_700Bold" },
  pointsBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(240,180,41,0.14)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  pointsText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  goalsPanel: {
    marginHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  goalsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  goalsTitle: { flex: 1, fontSize: 13, fontFamily: "Inter_700Bold" },
  goalsList: { gap: 5 },
  goalRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  goalMark: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 18, width: 16 },
  goalMainText: { flex: 1, fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 18 },
  goalSubText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  partyRow: { paddingHorizontal: 14, gap: 10 },
  card: {
    width: 132,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
  },
  enemyCard: {
    width: 132,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
    borderWidth: 1,
  },
  name: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  barTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  hp: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
