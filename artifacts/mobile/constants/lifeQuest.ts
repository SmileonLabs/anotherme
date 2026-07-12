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

/** The eight trainee STAR themes a quest can be generated around. */
export const LIFE_QUEST_THEMES: LifeQuestThemeMeta[] = [
  { key: "work", label: "무대 기초 연습", desc: "연습실, 셀프 리허설, 무대감", icon: "mic", color: "#3B82F6" },
  { key: "relationship", label: "첫 팬 반응", desc: "댓글, 응원, 작은 약속", icon: "users", color: "#EC4899" },
  { key: "money", label: "연습 자원 관리", desc: "소품, 콘텐츠, 연습실 계획", icon: "dollar-sign", color: "#10B981" },
  { key: "health", label: "연습생 루틴", desc: "컨디션, 발성, 회복", icon: "heart", color: "#EF4444" },
  { key: "study", label: "표현 기초 훈련", desc: "보컬·표정·멘트 연습", icon: "book-open", color: "#8B5CF6" },
  { key: "conflict", label: "기대 조율", desc: "자기 의심과 첫 기대 정리", icon: "shield", color: "#F59E0B" },
  { key: "startup", label: "데뷔 준비 노트", desc: "콘셉트 초안, 첫 콘텐츠 테스트", icon: "trending-up", color: "#06B6D4" },
  { key: "daily", label: "콘셉트 씨앗", desc: "말투, 색, 세계관 조각", icon: "star", color: "#FB923C" },
];

export const PROMOTED_LIFE_QUEST_THEMES: LifeQuestThemeMeta[] = [
  { key: "work", label: "공식 무대 준비", desc: "리허설, 세트리스트, 무대감", icon: "mic", color: "#3B82F6" },
  { key: "relationship", label: "팬클럽 소통", desc: "공지, 팬미팅, 응원 답장", icon: "users", color: "#EC4899" },
  { key: "money", label: "활동 예산 운영", desc: "굿즈, 콘텐츠, 제작 계획", icon: "dollar-sign", color: "#10B981" },
  { key: "health", label: "공식 STAR 루틴", desc: "스케줄, 발성, 회복", icon: "heart", color: "#EF4444" },
  { key: "study", label: "표현 고도화", desc: "라이브·무대·멘트 디테일", icon: "book-open", color: "#8B5CF6" },
  { key: "conflict", label: "팬덤 조율", desc: "오해와 갈등을 STAR답게", icon: "shield", color: "#F59E0B" },
  { key: "startup", label: "컴백 프로젝트", desc: "티저, 새 콘텐츠, 이벤트", icon: "trending-up", color: "#06B6D4" },
  { key: "daily", label: "세계관 확장", desc: "상징, 색, 공식 기록", icon: "star", color: "#FB923C" },
];

export const THEME_BY_KEY: Record<string, LifeQuestThemeMeta> = Object.fromEntries(
  LIFE_QUEST_THEMES.map((t) => [t.key, t]),
);

export const PROMOTED_THEME_BY_KEY: Record<string, LifeQuestThemeMeta> = Object.fromEntries(
  PROMOTED_LIFE_QUEST_THEMES.map((t) => [t.key, t]),
);

export function themeMeta(key: string, promoted = false): LifeQuestThemeMeta {
  const themes = promoted ? PROMOTED_LIFE_QUEST_THEMES : LIFE_QUEST_THEMES;
  const byKey = promoted ? PROMOTED_THEME_BY_KEY : THEME_BY_KEY;
  return byKey[key] ?? themes[themes.length - 1]!;
}

/** Korean labels for STAR stats a mission choice can grow. */
export const STAT_LABEL: Record<string, string> = {
  charm: "매력",
  stagePresence: "무대감",
  bond: "팬 유대",
  lore: "서사",
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
