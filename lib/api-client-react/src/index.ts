export * from "./generated/api";
export * from "./generated/api.schemas";
export {
  customFetch,
  createRequestId,
  RequestTimeoutError,
  StaleRequestContextError,
  setBaseUrl,
  setAuthTokenGetter,
  setCharacterProfileIdGetter,
} from "./custom-fetch";
export type { AuthTokenGetter, CharacterProfileIdGetter, CustomFetchOptions } from "./custom-fetch";
