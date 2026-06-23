import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
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
import { useThemeMode } from "@/hooks/useThemeMode";
import { gradients, gradientsDark } from "@/constants/colors";

export const ONBOARDING_KEY = "anotherme.onboarding.v1";

type Slide = {
  icon: keyof typeof Feather.glyphMap;
  accent: string;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    icon: "message-circle",
    accent: "#00B488",
    title: "또 다른 나를 깨우기",
    body: "대화하고, 배틀하고, 모험하세요.\n당신의 모든 활동이 또 다른 자아를 깨웁니다.",
  },
  {
    icon: "trending-up",
    accent: "#7C5CFC",
    title: "활동할수록 성장",
    body: "토크배틀과 라이프 퀘스트에서 쌓은 경험치로\n나만의 자아가 레벨업하고 능력치가 자랍니다.",
  },
  {
    icon: "user",
    accent: "#9D5CFC",
    title: "나만의 정체성",
    body: "성장한 자아는 고유한 성격과 강점을 갖게 됩니다.\nAI가 분석한 '또 다른 나'를 만나보세요.",
  },
  {
    icon: "shield",
    accent: "#4F7BF5",
    title: "가문에서 함께 경쟁",
    body: "동료들과 가문을 이루고 기억과 지혜를 모아\n가문전에서 다른 가문과 겨뤄보세요.",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const colors = useColors();
  const { scheme } = useThemeMode();
  const isDark = scheme === "dark";
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
            <LinearGradient
              colors={(isDark ? gradientsDark : gradients).soft}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconWrap}
            >
              <View style={[styles.iconInner, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#fff" }]}>
                <Feather name={slide.icon} size={48} color={slide.accent} />
              </View>
            </LinearGradient>
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
  slide: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36, gap: 28 },
  iconWrap: {
    width: 160,
    height: 160,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  iconInner: {
    width: 116,
    height: 116,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: -0.5 },
  body: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 23 },
  footer: { paddingHorizontal: 24, gap: 22 },
  dots: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7 },
  dot: { height: 8, borderRadius: 4 },
  cta: { borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  ctaText: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
