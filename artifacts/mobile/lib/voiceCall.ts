// Native fallback. Voice calls are only supported on the web/PWA build.
// Metro picks voiceCall.web.ts on web; this file is used on native.

export const voiceCallSupported = false;

export function primeAudioPlayback(): void {}

export function startRingback(): void {}

export function stopRingback(): void {}

export async function joinCall(_url: string, _token: string): Promise<void> {
  throw new Error("음성 통화는 웹에서만 지원됩니다");
}

export async function setMuted(_muted: boolean): Promise<void> {}

export async function leaveCall(): Promise<void> {}
