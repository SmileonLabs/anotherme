import { Feather } from "@expo/vector-icons";

export type LifeQuestThemeKey =
  | "work"
  | "relationship"
  | "money"
  | "health"
  | "study"
  | "conflict"
  | "startup"
  | "daily";

export interface LifeQuestThemeMeta {
  key: LifeQuestThemeKey;
  label: string;
  desc: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}

/** The eight everyday-life themes a quest can be generated around. */
export const LIFE_QUEST_THEMES: LifeQuestThemeMeta[] = [
  { key: "work", label: "직장·업무", desc: "마감, 협업, 커뮤니케이션", icon: "briefcase", color: "#3B82F6" },
  { key: "relationship", label: "인간관계", desc: "친구·연인·가족 사이", icon: "users", color: "#EC4899" },
  { key: "money", label: "돈 관리", desc: "소비, 절약, 계획", icon: "dollar-sign", color: "#10B981" },
  { key: "health", label: "생활 습관", desc: "수면·운동·휴식 루틴", icon: "heart", color: "#EF4444" },
  { key: "study", label: "공부·성장", desc: "배움과 자기계발", icon: "book-open", color: "#8B5CF6" },
  { key: "conflict", label: "갈등 해결", desc: "오해와 의견 충돌", icon: "shield", color: "#F59E0B" },
  { key: "startup", label: "창업·도전", desc: "사이드 프로젝트, 결정", icon: "trending-up", color: "#06B6D4" },
  { key: "daily", label: "일상 선택", desc: "소소한 하루의 갈림길", icon: "sun", color: "#FB923C" },
];

export const THEME_BY_KEY: Record<string, LifeQuestThemeMeta> = Object.fromEntries(
  LIFE_QUEST_THEMES.map((t) => [t.key, t]),
);

export function themeMeta(key: string): LifeQuestThemeMeta {
  return THEME_BY_KEY[key] ?? LIFE_QUEST_THEMES[LIFE_QUEST_THEMES.length - 1]!;
}

/** Korean labels for the seven persona stats a choice can grow. */
export const STAT_LABEL: Record<string, string> = {
  logic: "논리",
  empathy: "공감",
  wit: "재치",
  knowledge: "지식",
  conviction: "소신",
  emotion: "감정 조절",
  decisiveness: "결단력",
};

/** Risk-level display (boldness of a choice, not correctness). */
export const RISK_META: Record<string, { label: string; color: string }> = {
  low: { label: "안정적", color: "#10B981" },
  medium: { label: "보통", color: "#F59E0B" },
  high: { label: "과감함", color: "#EF4444" },
};

export function statEntries(stats: Record<string, number | undefined> | undefined | null): {
  key: string;
  label: string;
  value: number;
}[] {
  if (!stats) return [];
  return Object.entries(stats)
    .filter(([, v]) => typeof v === "number" && v !== 0)
    .map(([key, v]) => ({ key, label: STAT_LABEL[key] ?? key, value: v as number }));
}
