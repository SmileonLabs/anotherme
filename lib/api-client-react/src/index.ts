export * from "./generated/api";
export * from "./generated/api.schemas";
export { customFetch, setBaseUrl, setAuthTokenGetter, setCharacterProfileIdGetter } from "./custom-fetch";
export type { AuthTokenGetter, CharacterProfileIdGetter } from "./custom-fetch";
