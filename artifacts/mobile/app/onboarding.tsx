import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export const ONBOARDING_KEY = "anotherme.onboarding.v1";

const FAN_CHARACTER_IMAGE = require("../assets/images/fan.png");
const FAN_CARD_BG_IMAGE = require("../assets/images/fan_bg.png");
const STAR_CARD_BG_IMAGE = require("../assets/images/star_bg.png");

type Slide = {
  icon: keyof typeof Feather.glyphMap;
  accent: string;
  badge: string;
  title: string;
  body: string;
  bg: number;
  character?: number;
  points: string[];
};

const SLIDES: Slide[] = [
  {
    icon: "heart",
    accent: "#F472B6",
    badge: "FAN 기본 시작",
    title: "누구나 FAN으로 시작해요",
    body: "채팅, 응원, 데일리 미션, 토크배틀이 FAN 레벨과 자아 프로필로 쌓입니다.",
    bg: FAN_CARD_BG_IMAGE,
    character: FAN_CHARACTER_IMAGE,
    points: ["FAN Lv/FAN XP", "응원력", "공개 피드"],
  },
  {
    icon: "star",
    accent: "#A78BFA",
    badge: "STAR NFT",
    title: "STAR는 NFT 장착 후 열려요",
    body: "마이페이지에서 STAR NFT를 인증하고 장착하면 연습생 STAR 성장이 시작됩니다.",
    bg: STAR_CARD_BG_IMAGE,
    points: ["NFT 등록", "캐릭터 장착", "STAR 미션"],
  },
  {
    icon: "target",
    accent: "#38BDF8",
    badge: "오늘 할 일",
    title: "퀘스트는 데일리 미션이에요",
    body: "하단 퀘스트 탭에서 매일 초기화되는 미션을 완료하고 보상을 받을 수 있어요.",
    bg: FAN_CARD_BG_IMAGE,
    character: FAN_CHARACTER_IMAGE,
    points: ["일일 미션", "주간 미션", "업적 보상"],
  },
  {
    icon: "bar-chart-2",
    accent: "#FBBF24",
    badge: "성장 기록",
    title: "피드와 랭킹으로 증명하세요",
    body: "FAN 응원글, 공식 STAR 기록, 토크배틀 결과가 나의 공개 성장 기록이 됩니다.",
    bg: STAR_CARD_BG_IMAGE,
    points: ["피드", "토크배틀", "누적 랭킹"],
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W } = useWindowDimensions();
  const scrollRef = React.useRef<ScrollView>(null);
  const [page, setPage] = React.useState(0);

  const isLast = page === SLIDES.length - 1;

  const finish = React.useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    } catch {
      // ignore persistence errors — worst case onboarding shows again
    }
    router.replace("/(tabs)");
  }, [router]);

  const goNext = React.useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    const next = page + 1;
    scrollRef.current?.scrollTo({ x: next * SCREEN_W, animated: true });
    setPage(next);
  }, [isLast, page, finish, SCREEN_W]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={8} onPress={finish} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <Text style={[styles.skip, { color: colors.mutedForeground }]}>건너뛰기</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))
        }
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={[styles.slide, { width: SCREEN_W }]}>
            <View style={styles.visualCard}>
              <ExpoImage source={slide.bg} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient
                colors={["rgba(7,5,22,0.86)", "rgba(18,10,46,0.42)", "rgba(7,5,22,0.92)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.visualTopRow}>
                <View style={[styles.visualIcon, { backgroundColor: `${slide.accent}24` }]}>
                  <Feather name={slide.icon} size={20} color={slide.accent} />
                </View>
                <Text style={styles.visualBadge}>{slide.badge}</Text>
              </View>

              <View style={styles.visualBody}>
                <View style={styles.levelBlock}>
                  <Text style={styles.levelText}>Lv. 1</Text>
                  <View style={styles.track}>
                    <View style={[styles.fill, { backgroundColor: slide.accent }]} />
                  </View>
                  <Text style={styles.xpText}>성장 준비 완료</Text>
                </View>

                {slide.character ? (
                  <ExpoImage source={slide.character} style={styles.characterImage} contentFit="contain" />
                ) : (
                  <View style={styles.starPlaceholder}>
                    <Feather name="star" size={62} color="#E8DDFF" />
                  </View>
                )}
              </View>

              <View style={styles.pointRow}>
                {slide.points.map((point) => (
                  <View key={point} style={styles.pointChip}>
                    <Text style={styles.pointText}>{point}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Text style={[styles.title, { color: colors.foreground }]}>{slide.title}</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  width: i === page ? 22 : 8,
                  backgroundColor: i === page ? colors.primary : colors.border,
                },
              ]}
            />
          ))}
        </View>
        <Pressable
          onPress={goNext}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.foreground, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.ctaText, { color: colors.background }]}>
            {isLast ? "시작하기" : "다음"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  topBar: { alignItems: "flex-end", paddingHorizontal: 20, paddingBottom: 4 },
  skip: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  slide: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 24 },
  visualCard: {
    width: "100%",
    maxWidth: 360,
    minHeight: 390,
    borderRadius: 28,
    overflow: "hidden",
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(216,180,254,0.26)",
    backgroundColor: "#090717",
  },
  visualTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 2 },
  visualIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  visualBadge: { color: "#E8DDFF", fontSize: 12, fontFamily: "Inter_800ExtraBold" },
  visualBody: { flex: 1, flexDirection: "row", alignItems: "center", zIndex: 2 },
  levelBlock: { flex: 0.88, gap: 8 },
  levelText: { color: "#fff", fontSize: 36, fontFamily: "Inter_800ExtraBold", letterSpacing: -1 },
  track: { height: 7, borderRadius: 999, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.12)" },
  fill: { width: "42%", height: "100%", borderRadius: 999 },
  xpText: { color: "rgba(255,255,255,0.62)", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  characterImage: { flex: 1.1, height: 300, marginRight: -18 },
  starPlaceholder: {
    flex: 1.1,
    height: 210,
    marginLeft: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(139,92,246,0.24)",
    borderWidth: 1,
    borderColor: "rgba(216,180,254,0.38)",
  },
  pointRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, zIndex: 2 },
  pointChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.09)" },
  pointText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: -0.5 },
  body: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 23, paddingHorizontal: 8 },
  footer: { paddingHorizontal: 24, gap: 22 },
  dots: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7 },
  dot: { height: 8, borderRadius: 4 },
  cta: { borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  ctaText: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
