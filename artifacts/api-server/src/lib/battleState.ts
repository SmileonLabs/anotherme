import type { BattleState } from "@workspace/db";
import { roundOf } from "./battleRules";

/** Grace window (seconds) absorbing network/clock skew before a turn is forfeited. */
const EXPIRY_GRACE = 2;

export function computeRemaining(state: BattleState, nowMs = Date.now()): number {
  if (state.phase !== "active" || !state.turnStartedAt) return 0;
  const elapsed = (nowMs - new Date(state.turnStartedAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(state.timeLimitSeconds - elapsed));
}

function secondsLeft(state: BattleState, nowMs: number): number {
  if (state.phase !== "active" || !state.turnStartedAt) return 0;
  return state.timeLimitSeconds - (nowMs - new Date(state.turnStartedAt).getTime()) / 1000;
}

export function isExpired(state: BattleState, nowMs = Date.now()): boolean {
  return secondsLeft(state, nowMs) <= -EXPIRY_GRACE;
}

export function currentSpeakerIsAI(state: BattleState): boolean {
  return !!state.participants.find((participant) => participant.userId === state.currentSpeakerUserId)?.isAI;
}

/**
 * Advance after a scored turn. The persisted BattleState is mutated intentionally
 * to retain the existing transaction and caller contract.
 */
export function advanceTurn(state: BattleState, nowMs = Date.now()): string[] {
  const lines: string[] = [];
  const nextIndex = state.turnIndex + 1;
  if (nextIndex >= state.totalRounds * 2) {
    state.turnIndex = nextIndex;
    state.phase = "ended";
    state.ended = true;
    state.currentSpeakerUserId = null;
    state.turnStartedAt = null;
    const [first, second] = state.participants;
    if (first && second) {
      if (first.totalScore > second.totalScore) state.winnerUserId = first.userId;
      else if (second.totalScore > first.totalScore) state.winnerUserId = second.userId;
      else state.winnerUserId = null;
    }
    lines.push(
      state.winnerUserId === null
        ? `🏁 토론 종료! 무승부입니다. (${state.participants.map((participant) => `${participant.name} ${participant.totalScore}점`).join(" vs ")})`
        : `🏁 토론 종료! 승자는 ${state.participants.find((participant) => participant.userId === state.winnerUserId)?.name ?? "?"} 님입니다. (${state.participants.map((participant) => `${participant.name} ${participant.totalScore}점`).join(" vs ")})`,
    );
    return lines;
  }
  state.turnIndex = nextIndex;
  state.currentSpeakerUserId = state.order[nextIndex % 2] ?? null;
  state.turnStartedAt = new Date(nowMs).toISOString();
  if (nextIndex % 2 === 0) lines.push(`🔔 라운드 ${roundOf(nextIndex)} 시작`);
  return lines;
}
