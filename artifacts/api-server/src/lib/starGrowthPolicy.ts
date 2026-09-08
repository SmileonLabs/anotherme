export function computeStarLevel(xp: number): number {
  let level = 1;
  while (xp >= 50 * level * (level + 1)) level++;
  return level;
}

export function computeEvolutionStage(level: number): string {
  if (level >= 50) return "ultimate";
  if (level >= 30) return "signature";
  if (level >= 20) return "advanced";
  if (level >= 10) return "awakening";
  if (level >= 5) return "growth_1";
  return "base";
}
