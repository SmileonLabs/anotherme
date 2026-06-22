export * from "./generated/api";
export * from "./generated/types";

// `ListClanMemoriesParams` is emitted by BOTH generators: the zod client emits a
// path-param schema (generated/api) and the schema-type generator emits a
// query-param type (generated/types). This is the first endpoint with both a
// path param AND query params. Prefer the zod schema; the query-param shape is
// still available via `z.infer<typeof ListClanMemoriesQueryParams>`.
export { ListClanMemoriesParams } from "./generated/api";

// `CreateClanWarBody` and `SubmitClanWarArgumentBody` are emitted by BOTH
// generators (a zod body schema in generated/api and a body type in
// generated/types). Prefer the zod schemas; the type shapes remain available via
// `z.infer<typeof ...>`.
export { CreateClanWarBody, SubmitClanWarArgumentBody } from "./generated/api";
