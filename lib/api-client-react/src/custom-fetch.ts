export type CustomFetchOptions = RequestInit & {
  responseType?: "json" | "text" | "blob" | "auto";
  /** Caller-selected deadline. Long uploads/streams should use their own policy. */
  timeoutMs?: number;
  /** Stable correlation id for retries of one logical attempt. */
  requestId?: string;
};

export type ErrorType<T = unknown> = ApiError<T>;

export type BodyType<T> = T;

export type AuthTokenGetter = () => Promise<string | null> | string | null;
export type CharacterProfileIdGetter = () => string | null;

function withoutQueryOrFragment(url: string): string {
  const boundary = url.search(/[?#]/);
  return boundary < 0 ? url : url.slice(0, boundary);
}

export class RequestTimeoutError extends Error {
  readonly name = "RequestTimeoutError";
  readonly method: string;
  readonly url: string;
  readonly timeoutMs: number;
  readonly requestId: string;

  constructor(
    method: string,
    url: string,
    timeoutMs: number,
    requestId: string,
  ) {
    const safeUrl = withoutQueryOrFragment(url);
    super(`Request timed out after ${timeoutMs}ms (${method} ${safeUrl})`);
    this.method = method;
    this.url = safeUrl;
    this.timeoutMs = timeoutMs;
    this.requestId = requestId;
  }
}

/**
 * The signed-in session changed while a request was acquiring credentials or
 * awaiting its response. The old response must never be delivered into the new
 * session's cache or mutation callbacks.
 */
export class StaleRequestContextError extends Error {
  readonly name = "StaleRequestContextError";

  constructor() {
    super("The authenticated request context changed before completion.");
  }
}

const NO_BODY_STATUS = new Set([204, 205, 304]);
const DEFAULT_JSON_ACCEPT = "application/json, application/problem+json";

// ---------------------------------------------------------------------------
// Module-level configuration
// ---------------------------------------------------------------------------

let _baseUrl: string | null = null;
let _authTokenGetter: AuthTokenGetter | null = null;
let _characterProfileIdGetter: CharacterProfileIdGetter | null = null;
let _authContextGeneration = 0;
let _profileContextGeneration = 0;

/**
 * Set a base URL that is prepended to every relative request URL
 * (i.e. paths that start with `/`).
 *
 * Useful for Expo bundles that need to call a remote API server.
 * Pass `null` to clear the base URL.
 */
export function setBaseUrl(url: string | null): void {
  _baseUrl = url ? url.replace(/\/+$/, "") : null;
}

/**
 * Register a getter that supplies a bearer auth token.  Before every fetch
 * the getter is invoked; when it returns a non-null string, an
 * `Authorization: Bearer <token>` header is attached to the request.
 *
 * Useful for Expo bundles making token-gated API calls.
 * Pass `null` to clear the getter.
 *
 * NOTE: This function should never be used in web applications where session
 * token cookies are automatically associated with API calls by the browser.
 */
export function setAuthTokenGetter(getter: AuthTokenGetter | null): void {
  _authTokenGetter = getter;
  _authContextGeneration += 1;
}

export function setCharacterProfileIdGetter(getter: CharacterProfileIdGetter | null): void {
  const previous = _characterProfileIdGetter?.() ?? null;
  const next = getter?.() ?? null;
  _characterProfileIdGetter = getter;
  if (previous !== next) _profileContextGeneration += 1;
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function resolveMethod(input: RequestInfo | URL, explicitMethod?: string): string {
  if (explicitMethod) return explicitMethod.toUpperCase();
  if (isRequest(input)) return input.method.toUpperCase();
  return "GET";
}

// Use loose check for URL — some runtimes (e.g. React Native) polyfill URL
// differently, so `instanceof URL` can fail.
function isUrl(input: RequestInfo | URL): input is URL {
  return typeof URL !== "undefined" && input instanceof URL;
}

function applyBaseUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (!_baseUrl) return input;
  const url = resolveUrl(input);
  // Only prepend to relative paths (starting with /)
  if (!url.startsWith("/")) return input;

  const absolute = `${_baseUrl}${url}`;
  if (typeof input === "string") return absolute;
  if (isUrl(input)) return new URL(absolute);
  return new Request(absolute, input as Request);
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (isUrl(input)) return input.toString();
  return input.url;
}

export function createRequestId(): string {
  const cryptoObject = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoObject?.randomUUID === "function") return cryptoObject.randomUUID();
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

function abortFailure(signal: AbortSignal): unknown {
  const reason = (signal as AbortSignal & { reason?: unknown }).reason;
  if (reason !== undefined) return reason;
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function requestAbortContext(
  signals: Array<AbortSignal | null | undefined>,
  timeoutMs: number | undefined,
) {
  const sources = [...new Set(signals.filter((signal): signal is AbortSignal => Boolean(signal)))];
  if (sources.length === 0 && timeoutMs == null) {
    return { signal: undefined, timedOut: () => false, cleanup: () => {} };
  }

  const controller = new AbortController();
  let timeoutReached = false;
  const listeners = sources.map((source) => {
    const abortFromCaller = () => {
      if (!controller.signal.aborted) controller.abort(abortFailure(source));
    };
    if (source.aborted) abortFromCaller();
    else source.addEventListener("abort", abortFromCaller, { once: true });
    return { source, abortFromCaller };
  });

  const timer = timeoutMs == null
    ? undefined
    : setTimeout(() => {
        if (controller.signal.aborted) return;
        timeoutReached = true;
        controller.abort();
      }, timeoutMs);

  return {
    signal: controller.signal,
    timedOut: () => timeoutReached,
    cleanup: () => {
      if (timer != null) clearTimeout(timer);
      for (const { source, abortFromCaller } of listeners) {
        source.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}

async function waitWithSignal<T>(value: PromiseLike<T> | T, signal: AbortSignal | undefined) {
  if (!signal) return await value;
  if (signal.aborted) throw abortFailure(signal);

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortFailure(signal));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(value).then(
      (result) => {
        cleanup();
        resolve(result);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();

  for (const source of sources) {
    if (!source) continue;
    new Headers(source).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

function getMediaType(headers: Headers): string | null {
  const value = headers.get("content-type");
  return value ? value.split(";", 1)[0].trim().toLowerCase() : null;
}

function isJsonMediaType(mediaType: string | null): boolean {
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

function isTextMediaType(mediaType: string | null): boolean {
  return Boolean(
    mediaType &&
      (mediaType.startsWith("text/") ||
        mediaType === "application/xml" ||
        mediaType === "text/xml" ||
        mediaType.endsWith("+xml") ||
        mediaType === "application/x-www-form-urlencoded"),
  );
}

// Use strict equality: in browsers, `response.body` is `null` when the
// response genuinely has no content.  In React Native, `response.body` is
// always `undefined` because the ReadableStream API is not implemented —
// even when the response carries a full payload readable via `.text()` or
// `.json()`.  Loose equality (`== null`) matches both `null` and `undefined`,
// which causes every React Native response to be treated as empty.
function hasNoBody(response: Response, method: string): boolean {
  if (method === "HEAD") return true;
  if (NO_BODY_STATUS.has(response.status)) return true;
  if (response.headers.get("content-length") === "0") return true;
  if (response.body === null) return true;
  return false;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function getStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "string") return undefined;

  const trimmed = candidate.trim();
  return trimmed === "" ? undefined : trimmed;
}

function truncate(text: string, maxLength = 300): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function buildErrorMessage(response: Response, data: unknown): string {
  const prefix = `HTTP ${response.status} ${response.statusText}`;

  if (typeof data === "string") {
    const text = data.trim();
    return text ? `${prefix}: ${truncate(text)}` : prefix;
  }

  const title = getStringField(data, "title");
  const detail = getStringField(data, "detail");
  const message =
    getStringField(data, "message") ??
    getStringField(data, "error_description") ??
    getStringField(data, "error");

  if (title && detail) return `${prefix}: ${title} — ${detail}`;
  if (detail) return `${prefix}: ${detail}`;
  if (message) return `${prefix}: ${message}`;
  if (title) return `${prefix}: ${title}`;

  return prefix;
}

export class ApiError<T = unknown> extends Error {
  readonly name = "ApiError";
  readonly status: number;
  readonly statusText: string;
  readonly data: T | null;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;

  constructor(
    response: Response,
    data: T | null,
    requestInfo: { method: string; url: string },
  ) {
    super(buildErrorMessage(response, data));
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.data = data;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = withoutQueryOrFragment(response.url || requestInfo.url);
  }
}

export class ResponseParseError extends Error {
  readonly name = "ResponseParseError";
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;
  readonly rawBody: string;
  readonly cause: unknown;

  constructor(
    response: Response,
    rawBody: string,
    cause: unknown,
    requestInfo: { method: string; url: string },
  ) {
    const safeUrl = withoutQueryOrFragment(response.url || requestInfo.url);
    super(
      `Failed to parse response from ${requestInfo.method} ${safeUrl} ` +
        `(${response.status} ${response.statusText}) as JSON`,
    );
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = safeUrl;
    this.rawBody = rawBody;
    this.cause = cause;
  }
}

async function parseJsonBody(
  response: Response,
  requestInfo: { method: string; url: string },
): Promise<unknown> {
  const raw = await response.text();
  const normalized = stripBom(raw);

  if (normalized.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch (cause) {
    throw new ResponseParseError(response, raw, cause, requestInfo);
  }
}

async function parseErrorBody(response: Response, method: string): Promise<unknown> {
  if (hasNoBody(response, method)) {
    return null;
  }

  const mediaType = getMediaType(response.headers);

  // Fall back to text when blob() is unavailable (e.g. some React Native builds).
  if (mediaType && !isJsonMediaType(mediaType) && !isTextMediaType(mediaType)) {
    return typeof response.blob === "function" ? response.blob() : response.text();
  }

  const raw = await response.text();
  const normalized = stripBom(raw);
  const trimmed = normalized.trim();

  if (trimmed === "") {
    return null;
  }

  if (isJsonMediaType(mediaType) || looksLikeJson(normalized)) {
    try {
      return JSON.parse(normalized);
    } catch {
      return raw;
    }
  }

  return raw;
}

function inferResponseType(response: Response): "json" | "text" | "blob" {
  const mediaType = getMediaType(response.headers);

  if (isJsonMediaType(mediaType)) return "json";
  if (isTextMediaType(mediaType) || mediaType == null) return "text";
  return "blob";
}

async function parseSuccessBody(
  response: Response,
  responseType: "json" | "text" | "blob" | "auto",
  requestInfo: { method: string; url: string },
): Promise<unknown> {
  if (hasNoBody(response, requestInfo.method)) {
    return null;
  }

  const effectiveType =
    responseType === "auto" ? inferResponseType(response) : responseType;

  switch (effectiveType) {
    case "json":
      return parseJsonBody(response, requestInfo);

    case "text": {
      const text = await response.text();
      return text === "" ? null : text;
    }

    case "blob":
      if (typeof response.blob !== "function") {
        throw new TypeError(
          "Blob responses are not supported in this runtime. " +
            "Use responseType \"json\" or \"text\" instead.",
        );
      }
      return response.blob();
  }
}

export async function customFetch<T = unknown>(
  input: RequestInfo | URL,
  options: CustomFetchOptions = {},
): Promise<T> {
  input = applyBaseUrl(input);
  const {
    responseType = "auto",
    timeoutMs,
    requestId = createRequestId(),
    headers: headersInit,
    ...init
  } = options;

  const method = resolveMethod(input, init.method);

  if (init.body != null && (method === "GET" || method === "HEAD")) {
    throw new TypeError(`customFetch: ${method} requests cannot have a body.`);
  }

  const headers = mergeHeaders(isRequest(input) ? input.headers : undefined, headersInit);
  if (!headers.has("x-request-id")) headers.set("x-request-id", requestId);

  // Capture one coherent caller context before the first await. Reading the
  // profile getter after token acquisition could otherwise turn a request
  // initiated as profile A into a write attributed to profile B.
  const authContextGeneration = _authContextGeneration;
  const profileContextGeneration = _profileContextGeneration;
  const authTokenGetter = _authTokenGetter;
  const capturedProfileId =
    !headers.has("x-character-profile-id") && _characterProfileIdGetter
      ? _characterProfileIdGetter()
      : null;

  if (
    typeof init.body === "string" &&
    !headers.has("content-type") &&
    looksLikeJson(init.body)
  ) {
    headers.set("content-type", "application/json");
  }

  if (responseType === "json" && !headers.has("accept")) {
    headers.set("accept", DEFAULT_JSON_ACCEPT);
  }

  const requestInfo = { method, url: resolveUrl(input) };

  if (timeoutMs != null && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new TypeError("customFetch: timeoutMs must be a positive finite number.");
  }
  const requestSignal = isRequest(input) ? input.signal : undefined;
  const abortContext = requestAbortContext([requestSignal, init.signal], timeoutMs);
  try {
    if (abortContext.signal?.aborted) throw abortFailure(abortContext.signal);

    // Token acquisition is part of the caller-visible request deadline. The
    // getter itself may not be cancellable, but a late result is ignored after
    // abort and never starts a network request.
    if (authTokenGetter && !headers.has("authorization")) {
      const token = await waitWithSignal(authTokenGetter(), abortContext.signal);
      if (_authContextGeneration !== authContextGeneration) {
        throw new StaleRequestContextError();
      }
      if (token) headers.set("authorization", `Bearer ${token}`);
    }

    if (capturedProfileId) {
      headers.set("x-character-profile-id", capturedProfileId);
    }

    const response = await waitWithSignal(
      fetch(input, {
        ...init,
        method,
        headers,
        signal: abortContext.signal,
      }),
      abortContext.signal,
    );

    // Keep the deadline alive until the response body has been consumed. A
    // fetch promise resolves when response headers arrive; clearing the timer
    // there would allow a stalled JSON/body stream to hang indefinitely.
    if (!response.ok) {
      const errorData = await waitWithSignal(
        parseErrorBody(response, method),
        abortContext.signal,
      );
      throw new ApiError(response, errorData, requestInfo);
    }

    const parsed = await waitWithSignal(
      parseSuccessBody(response, responseType, requestInfo),
      abortContext.signal,
    );
    if (
      _authContextGeneration !== authContextGeneration ||
      _profileContextGeneration !== profileContextGeneration
    ) {
      throw new StaleRequestContextError();
    }
    return parsed as T;
  } catch (error) {
    if (timeoutMs != null && abortContext.timedOut()) {
      throw new RequestTimeoutError(method, requestInfo.url, timeoutMs, requestId);
    }
    throw error;
  } finally {
    abortContext.cleanup();
  }
}
