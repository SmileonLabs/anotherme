import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const psqlConnection = new URL(process.env.DATABASE_URL);
psqlConnection.searchParams.delete("useLibpqCompat");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(readFileSync(path.join(root, "lib/db/drizzle/meta/0000_snapshot.json"), "utf8"));

const query = `
WITH public_tables AS (
  SELECT c.oid, c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
)
SELECT json_build_object(
  'columns', COALESCE((SELECT json_agg(json_build_object(
    'table', source.relname, 'name', attribute.attname,
    'type', format_type(attribute.atttypid, attribute.atttypmod),
    'notNull', attribute.attnotnull, 'default', pg_get_expr(default_value.adbin, default_value.adrelid)
  ) ORDER BY source.relname, attribute.attnum) FROM public_tables source
  JOIN pg_attribute attribute ON attribute.attrelid = source.oid AND attribute.attnum > 0 AND NOT attribute.attisdropped
  LEFT JOIN pg_attrdef default_value ON default_value.adrelid = source.oid AND default_value.adnum = attribute.attnum), '[]'::json),
  'primaryKeys', COALESCE((SELECT json_agg(json_build_object('table', source.relname, 'columns', ARRAY(
    SELECT att.attname FROM unnest(con.conkey) WITH ORDINALITY keys(attnum, ord)
    JOIN pg_attribute att ON att.attrelid = source.oid AND att.attnum = keys.attnum ORDER BY keys.ord
  )) ORDER BY source.relname) FROM pg_constraint con JOIN public_tables source ON source.oid = con.conrelid WHERE con.contype = 'p'), '[]'::json),
  'foreignKeys', COALESCE((SELECT json_agg(json_build_object(
    'name', con.conname, 'table', source.relname, 'columns', ARRAY(
      SELECT att.attname FROM unnest(con.conkey) WITH ORDINALITY keys(attnum, ord)
      JOIN pg_attribute att ON att.attrelid = source.oid AND att.attnum = keys.attnum ORDER BY keys.ord
    ), 'referencesTable', target.relname, 'referencesColumns', ARRAY(
      SELECT att.attname FROM unnest(con.confkey) WITH ORDINALITY keys(attnum, ord)
      JOIN pg_attribute att ON att.attrelid = target.oid AND att.attnum = keys.attnum ORDER BY keys.ord
    ), 'onDelete', con.confdeltype, 'onUpdate', con.confupdtype
  ) ORDER BY con.conname) FROM pg_constraint con JOIN public_tables source ON source.oid = con.conrelid
  JOIN pg_class target ON target.oid = con.confrelid WHERE con.contype = 'f'), '[]'::json),
  'uniqueConstraints', COALESCE((SELECT json_agg(json_build_object(
    'name', con.conname, 'table', source.relname, 'columns', ARRAY(
      SELECT att.attname FROM unnest(con.conkey) WITH ORDINALITY keys(attnum, ord)
      JOIN pg_attribute att ON att.attrelid = source.oid AND att.attnum = keys.attnum ORDER BY keys.ord
    )
  ) ORDER BY con.conname) FROM pg_constraint con JOIN public_tables source ON source.oid = con.conrelid WHERE con.contype = 'u'), '[]'::json),
  'indexes', COALESCE((SELECT json_agg(json_build_object(
    'name', index_class.relname, 'table', source.relname, 'columns', ARRAY(
      SELECT att.attname FROM unnest(index_rel.indkey) WITH ORDINALITY keys(attnum, ord)
      JOIN pg_attribute att ON att.attrelid = source.oid AND att.attnum = keys.attnum ORDER BY keys.ord
    ), 'unique', index_rel.indisunique, 'method', access_method.amname,
    'where', pg_get_expr(index_rel.indpred, index_rel.indrelid)
  ) ORDER BY index_class.relname) FROM pg_index index_rel JOIN public_tables source ON source.oid = index_rel.indrelid
  JOIN pg_class index_class ON index_class.oid = index_rel.indexrelid JOIN pg_am access_method ON access_method.oid = index_class.relam
  WHERE NOT index_rel.indisprimary AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = index_rel.indexrelid)), '[]'::json)
);
`;

const output = execFileSync("psql", [psqlConnection.toString(), "--tuples-only", "--no-align", "--command", query], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
}).trim();
const catalog = JSON.parse(output);
const normalizeType = (value) => String(value ?? "").toLowerCase()
  .replace(/character varying/g, "varchar").replace(/timestamp\(\d+\)/g, "timestamp").replace(/\s+/g, " ").trim();
function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, stableJson(child)]));
  }
  return value;
}
const normalizeDefault = (value) => {
  const raw = String(value ?? "").trim();
  const jsonDefault = raw.match(/^'(.*)'::jsonb$/i);
  if (jsonDefault) return `jsonb:${JSON.stringify(stableJson(JSON.parse(jsonDefault[1])))}`;
  return raw.toLowerCase().replace(/::[a-z_ ]+(\[\])?/g, "").replace(/\s+/g, "").replace(/^\((.*)\)$/, "$1");
};
const normalizePredicate = (value) => String(value ?? "").toLowerCase()
  .replace(/"/g, "").replace(/\b[a-z_][a-z0-9_]*\./g, "")
  .replace(/::[a-z_ ]+(\[\])?/g, "").replace(/\s+/g, "").replace(/^\((.*)\)$/, "$1");
const actions = { a: "no action", r: "restrict", c: "cascade", n: "set null", d: "set default" };
const key = (table, name) => `${table}.${name}`;
const errors = [];

const columns = new Map(catalog.columns.map((item) => [key(item.table, item.name), item]));
const primaryKeys = new Map(catalog.primaryKeys.map((item) => [item.table, item.columns]));
const foreignKeyKey = (item) => [item.table, item.columns.join(","), item.referencesTable, item.referencesColumns.join(","), actions[item.onDelete] ?? item.onDelete, actions[item.onUpdate] ?? item.onUpdate].join("|");
const foreignKeys = new Map(catalog.foreignKeys.map((item) => [foreignKeyKey(item), item]));
const uniqueConstraints = new Map(catalog.uniqueConstraints.map((item) => [item.name, item]));
const indexes = new Map(catalog.indexes.map((item) => [item.name, item]));

for (const table of Object.values(snapshot.tables)) {
  if (table.schema) continue;
  for (const column of Object.values(table.columns)) {
    const actual = columns.get(key(table.name, column.name));
    if (!actual) {
      errors.push(`missing column ${table.name}.${column.name}`);
      continue;
    }
    if (normalizeType(actual.type) !== normalizeType(column.type)) errors.push(`column type mismatch ${table.name}.${column.name}`);
    if (actual.notNull !== column.notNull) errors.push(`nullability mismatch ${table.name}.${column.name}`);
    if (normalizeDefault(actual.default) !== normalizeDefault(column.default)) errors.push(`default mismatch ${table.name}.${column.name}`);
  }
  const compositePrimaryKey = Object.values(table.compositePrimaryKeys ?? {})[0];
  const expectedPrimaryKey = compositePrimaryKey?.columns ?? Object.values(table.columns).filter((column) => column.primaryKey).map((column) => column.name);
  if (expectedPrimaryKey.join(",") !== (primaryKeys.get(table.name) ?? []).join(",")) errors.push(`primary key mismatch ${table.name}`);

  for (const foreignKey of Object.values(table.foreignKeys)) {
    const actual = foreignKeys.get([foreignKey.tableFrom, foreignKey.columnsFrom.join(","), foreignKey.tableTo, foreignKey.columnsTo.join(","), foreignKey.onDelete, foreignKey.onUpdate].join("|"));
    if (!actual) errors.push(`foreign key mismatch ${foreignKey.name}`);
  }
  for (const unique of Object.values(table.uniqueConstraints)) {
    const actual = uniqueConstraints.get(unique.name);
    if (!actual || actual.table !== table.name || actual.columns.join(",") !== unique.columns.join(",")) errors.push(`unique constraint mismatch ${unique.name}`);
  }
  for (const index of Object.values(table.indexes)) {
    const actual = indexes.get(index.name);
    const expectedColumns = index.columns.map((column) => column.expression).join(",");
    if (!actual || actual.table !== table.name || actual.columns.join(",") !== expectedColumns || actual.unique !== index.isUnique ||
      actual.method !== index.method || normalizePredicate(actual.where) !== normalizePredicate(index.where)) errors.push(`index mismatch ${index.name}`);
  }
}

if (errors.length > 0) throw new Error(`Baseline catalog does not match 0000 snapshot:\n${errors.map((error) => `- ${error}`).join("\n")}`);
console.log("Baseline catalog matches the committed Drizzle snapshot.");
