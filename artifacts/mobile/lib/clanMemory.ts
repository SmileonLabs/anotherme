import type { ClanMemoryMemoryType } from "@workspace/api-client-react";

export const MEMORY_TYPE_LABEL: Record<ClanMemoryMemoryType, string> = {
  strategy: "전략",
  lesson: "교훈",
  value: "가치",
  achievement: "업적",
  warning: "경고",
};

export const MEMORY_TYPE_TONE: Record<ClanMemoryMemoryType, string> = {
  strategy: "#3b82f6",
  lesson: "#8b5cf6",
  value: "#10b981",
  achievement: "#f59e0b",
  warning: "#ef4444",
};

export const MEMORY_TYPE_HINT: Record<ClanMemoryMemoryType, string> = {
  strategy: "승리를 부른 작전이나 접근법",
  lesson: "패배나 실수에서 얻은 깨달음",
  value: "가문이 지켜야 할 신념",
  achievement: "함께 이뤄낸 성과",
  warning: "다시는 반복하지 말아야 할 일",
};

export function formatMemoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return sameYear ? `${month}월 ${day}일` : `${d.getFullYear()}.${month}.${day}`;
}
