export * from "./generated/api";
export * from "./generated/types";

// Some endpoint parameter names are emitted by both generators. Prefer the zod
// schema export; a query-only shape remains available as a generated type where
// applicable (for example, `ListClanMemoriesQueryParams`).
export {
  FetchRoomMessagesParams,
  ListClanMemoriesParams,
  UnpinRoomMessageParams,
} from "./generated/api";

// `CreateClanWarBody` and `SubmitClanWarArgumentBody` are emitted by BOTH
// generators (a zod body schema in generated/api and a body type in
// generated/types). Prefer the zod schemas; the type shapes remain available via
// `z.infer<typeof ...>`.
export { CreateClanWarBody, SubmitClanWarArgumentBody } from "./generated/api";
