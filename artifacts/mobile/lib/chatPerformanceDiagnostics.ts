type CounterName =
  | "composerRenders"
  | "bubbleRenders"
  | "avatarRenders"
  | "stickerRenders"
  | "imageRenders"
  | "catchUpPages";

type PendingName = "typing" | "presence" | "messageSend";
type VariantName = "disableTyping" | "simpleAvatars" | "staticStickers";
type ResourceName = "timers" | "listeners";

interface DiagnosticsSample {
  elapsedMs: number;
  jsHeapMiB: number | null;
  domNodes: number | null;
  composerRenders: number;
  bubbleRenders: number;
}

interface DiagnosticsState {
  startedAt: number;
  counters: Record<CounterName, number>;
  pending: Record<PendingName, number>;
  maxPending: Record<PendingName, number>;
  resources: Record<ResourceName, number>;
  maxResources: Record<ResourceName, number>;
  inputCommitMs: number[];
  messageAckMs: number[];
  realtimeDeliveryAgeMs: number[];
  samples: DiagnosticsSample[];
}

const ENABLE_KEY = "anotherme:chat-perf:enabled";
const VARIANT_KEY_PREFIX = "anotherme:chat-perf:variant:";
const MAX_LATENCY_SAMPLES = 500;

function newState(): DiagnosticsState {
  return {
    startedAt: Date.now(),
    counters: {
      composerRenders: 0,
      bubbleRenders: 0,
      avatarRenders: 0,
      stickerRenders: 0,
      imageRenders: 0,
      catchUpPages: 0,
    },
    pending: { typing: 0, presence: 0, messageSend: 0 },
    maxPending: { typing: 0, presence: 0, messageSend: 0 },
    resources: { timers: 0, listeners: 0 },
    maxResources: { timers: 0, listeners: 0 },
    inputCommitMs: [],
    messageAckMs: [],
    realtimeDeliveryAgeMs: [],
    samples: [],
  };
}

let state = newState();

function localStorageValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Read the experiment configuration once. MessageBubble can render hundreds of
// times in a long room; consulting synchronous localStorage for every counter
// and avatar/sticker check would make the observer part of the performance
// problem we are trying to measure on iOS Safari.
let diagnosticsEnabled = localStorageValue(ENABLE_KEY) === "1";
const enabledVariants: Record<VariantName, boolean> = {
  disableTyping: localStorageValue(`${VARIANT_KEY_PREFIX}disableTyping`) === "1",
  simpleAvatars: localStorageValue(`${VARIANT_KEY_PREFIX}simpleAvatars`) === "1",
  staticStickers: localStorageValue(`${VARIANT_KEY_PREFIX}staticStickers`) === "1",
};
let sampleTimer: ReturnType<typeof setInterval> | null = null;

export function chatPerformanceDiagnosticsEnabled(): boolean {
  return diagnosticsEnabled;
}

export function chatDiagnosticVariantEnabled(name: VariantName): boolean {
  return diagnosticsEnabled && enabledVariants[name];
}

export function chatPerformanceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function noteChatRender(name: CounterName, amount = 1): void {
  if (!chatPerformanceDiagnosticsEnabled()) return;
  state.counters[name] += amount;
}

export function noteChatPending(name: PendingName, delta: 1 | -1): void {
  if (!chatPerformanceDiagnosticsEnabled()) return;
  state.pending[name] = Math.max(0, state.pending[name] + delta);
  state.maxPending[name] = Math.max(state.maxPending[name], state.pending[name]);
}

/** Tracks lifecycle-owned resources even while sampling is disabled. */
export function noteChatResource(name: ResourceName, delta: number): void {
  state.resources[name] = Math.max(0, state.resources[name] + delta);
  state.maxResources[name] = Math.max(
    state.maxResources[name],
    state.resources[name],
  );
}

export function noteChatInputCommit(startedAt: number): void {
  if (!chatPerformanceDiagnosticsEnabled()) return;
  const duration = chatPerformanceNow() - startedAt;
  if (!Number.isFinite(duration) || duration < 0) return;
  appendBoundedLatencySample(state.inputCommitMs, duration);
}

export function appendBoundedLatencySample(
  samples: number[],
  valueMs: number,
  maximum = MAX_LATENCY_SAMPLES,
): boolean {
  if (!Number.isFinite(valueMs) || !Number.isSafeInteger(maximum) || maximum < 1) {
    return false;
  }
  samples.push(Math.round(valueMs * 100) / 100);
  if (samples.length > maximum) samples.splice(0, samples.length - maximum);
  return true;
}

export function noteChatMessageAck(optimisticCreatedAt: number): void {
  if (!chatPerformanceDiagnosticsEnabled()) return;
  const duration = Date.now() - optimisticCreatedAt;
  if (duration < 0) return;
  appendBoundedLatencySample(state.messageAckMs, duration);
}

export function noteChatRealtimeDeliveryAge(serverCreatedAt: string): void {
  if (!chatPerformanceDiagnosticsEnabled()) return;
  const serverTime = Date.parse(serverCreatedAt);
  if (!Number.isFinite(serverTime)) return;
  // This is wall-clock based and therefore includes client/server clock skew.
  appendBoundedLatencySample(state.realtimeDeliveryAgeMs, Date.now() - serverTime);
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))];
}

function latencySummary(values: number[]) {
  return {
    samples: values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: values.length ? Math.max(...values) : null,
  };
}

function runtimeMetrics(): { jsHeapMiB: number | null; domNodes: number | null } {
  const memory =
    typeof performance !== "undefined" &&
    "memory" in performance &&
    typeof (performance as any).memory?.usedJSHeapSize === "number"
      ? Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024)
      : null;
  return {
    jsHeapMiB: memory,
    domNodes:
      typeof document !== "undefined"
        ? document.getElementsByTagName("*").length
        : null,
  };
}

function captureSample(): void {
  if (!diagnosticsEnabled) return;
  const runtime = runtimeMetrics();
  state.samples.push({
    elapsedMs: Date.now() - state.startedAt,
    ...runtime,
    composerRenders: state.counters.composerRenders,
    bubbleRenders: state.counters.bubbleRenders,
  });
  // Thirty minutes at 15-second intervals is enough to expose a monotonic
  // long-chat trend without letting diagnostics storage grow unbounded.
  if (state.samples.length > 120) state.samples.shift();
}

function syncSampleTimer(): void {
  if (typeof window === "undefined") return;
  if (diagnosticsEnabled && !sampleTimer) {
    captureSample();
    sampleTimer = setInterval(captureSample, 15_000);
  } else if (!diagnosticsEnabled && sampleTimer) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }
}

export function getChatPerformanceSnapshot() {
  const runtime = runtimeMetrics();
  return {
    elapsedMs: Date.now() - state.startedAt,
    counters: { ...state.counters },
    pending: { ...state.pending },
    maxPending: { ...state.maxPending },
    resources: { ...state.resources },
    maxResources: { ...state.maxResources },
    inputCommit: latencySummary(state.inputCommitMs),
    messageAck: latencySummary(state.messageAckMs),
    realtimeDeliveryAge: {
      ...latencySummary(state.realtimeDeliveryAgeMs),
      clockSkewSensitive: true,
    },
    ...runtime,
    samples: state.samples.map((sample) => ({ ...sample })),
    variants: {
      disableTyping: chatDiagnosticVariantEnabled("disableTyping"),
      simpleAvatars: chatDiagnosticVariantEnabled("simpleAvatars"),
      staticStickers: chatDiagnosticVariantEnabled("staticStickers"),
    },
  };
}

function installBrowserApi(): void {
  if (typeof window === "undefined") return;
  (window as any).__anotherMeChatDiagnostics = {
    enable(enabled = true) {
      diagnosticsEnabled = enabled;
      try {
        window.localStorage.setItem(ENABLE_KEY, enabled ? "1" : "0");
      } catch {}
      syncSampleTimer();
    },
    setVariant(name: VariantName, enabled: boolean) {
      if (!["disableTyping", "simpleAvatars", "staticStickers"].includes(name)) {
        throw new TypeError("unknown chat diagnostics variant");
      }
      enabledVariants[name] = enabled;
      try {
        window.localStorage.setItem(`${VARIANT_KEY_PREFIX}${name}`, enabled ? "1" : "0");
      } catch {}
    },
    snapshot: getChatPerformanceSnapshot,
    sample() {
      captureSample();
      return getChatPerformanceSnapshot();
    },
    reset() {
      const resources = { ...state.resources };
      state = newState();
      state.resources = resources;
      state.maxResources = { ...resources };
      captureSample();
    },
  };
}

installBrowserApi();
syncSampleTimer();
