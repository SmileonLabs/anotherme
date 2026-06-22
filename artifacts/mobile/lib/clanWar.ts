import type { ClanWarSummary } from "@workspace/api-client-react";
import type { useColors } from "@/hooks/useColors";

type WarStatus = ClanWarSummary["status"];

export const WAR_STATUS_LABEL: Record<string, string> = {
  open: "공개 도전",
  matched: "매칭됨",
  active: "진행 중",
  completing: "집계 중",
  completed: "완료",
  cancelled: "취소됨",
};

export function WAR_STATUS_TONE(
  status: WarStatus,
  colors: ReturnType<typeof useColors>,
): string {
  switch (status) {
    case "open":
      return colors.primary;
    case "matched":
    case "active":
    case "completing":
      return "#d97706";
    case "completed":
      return "#16a34a";
    default:
      return colors.mutedForeground;
  }
}

/** Short Korean outcome from the caller's clan perspective on a completed war. */
export function warOutcomeLabel(
  war: ClanWarSummary,
  myClanId: string | null,
): string | null {
  if (war.status !== "completed") return null;
  if (!war.winnerClanId) return "무승부";
  if (!myClanId) return null;
  if (myClanId !== war.challengerClanId && myClanId !== war.opponentClanId) return null;
  return war.winnerClanId === myClanId ? "승리" : "패배";
}
