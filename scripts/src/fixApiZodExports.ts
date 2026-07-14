import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Orval emits response schemas in both generated/api.ts and generated/types/index.ts.
// Keep the runtime Zod schema as the public export when a response name collides.
const barrel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../lib/api-zod/src/generated/types/index.ts");
const marker = "export * from './globalSearchResponse';";
if (fs.existsSync(barrel)) {
  const source = fs.readFileSync(barrel, "utf8");
  if (source.includes(marker)) {
    fs.writeFileSync(barrel, source.replace(marker, "// GlobalSearchResponse is exported from generated/api as the canonical Zod schema."));
  }
}
