export const TOTAL_ROUNDS = 3;
export const TURN_SECONDS = 45;
/** Hard cap on an utterance so a single turn cannot blow up the AI prompt. */
export const MAX_UTTERANCE_CHARS = 1000;

export function roundOf(turnIndex: number): number {
  return Math.floor(turnIndex / 2) + 1;
}

const LEVEL_SPAN = 500;

const LEVEL_TITLES = [
  "말문 트임",
  "입문 토론자",
  "수습 논객",
  "논리 초보",
  "열혈 토론가",
  "설득가",
  "날카로운 혀",
  "말빨 고수",
  "토론의 달인",
  "솔로몬의 후예",
] as const;

export interface BattleLevelInfo {
  level: number;
  title: string;
  /** TP accumulated within the current level (0..LEVEL_SPAN-1). */
  mpIntoLevel: number;
  /** TP span of a level (constant). */
  mpForNextLevel: number;
  /** TP remaining until the next level. */
  mpToNext: number;
}

/** Deterministically derive level/title/progress from total TP. */
export function battleLevelInfo(mp: number): BattleLevelInfo {
  const safe = Math.max(0, Math.floor(mp));
  const level = Math.floor(safe / LEVEL_SPAN) + 1;
  const mpIntoLevel = safe % LEVEL_SPAN;
  const title = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];
  return {
    level,
    title,
    mpIntoLevel,
    mpForNextLevel: LEVEL_SPAN,
    mpToNext: LEVEL_SPAN - mpIntoLevel,
  };
}
