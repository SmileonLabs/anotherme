import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const routesDirectory = path.join(root, "artifacts", "api-server", "src", "routes");
const openApiPath = path.join(root, "lib", "api-spec", "openapi.yaml");
const methods = new Set(["get", "post", "put", "patch", "delete"]);

// These endpoints are intentionally not published to generated clients. Keep the
// list small and explicit: public routes must be described in OpenAPI instead.
const exemptRoutes = new Set([
  "GET /knowledge/admin/me",
  "GET /knowledge/admin/sources",
  "GET /knowledge/admin/ontology-preview",
  "POST /knowledge/admin/google-search",
  "POST /knowledge/admin/google-search/import",
  "POST /knowledge/admin/sources",
  "DELETE /knowledge/admin/sources/{sourceId}",
  "POST /knowledge/admin/sources/{sourceId}/extract",
  "GET /knowledge/admin/review-items",
  "GET /knowledge/admin/chat-candidates",
  "POST /knowledge/admin/review-items/{id}/approve",
  "POST /knowledge/admin/review-items/{id}/reject",
  "GET /knowledge/admin/campaigns",
  "POST /knowledge/admin/campaigns",
  "POST /knowledge/admin/campaigns/{id}/test-delivery",
  "POST /calls/{id}/diagnostics",
  // NFT/RPG collection management is consumed by the mobile app through the
  // lightweight customFetch client until its generated contract is published.
  "GET /admin/nft/collections",
  "POST /admin/nft/collections",
  "POST /admin/nft/collections/{id}/analyze",
  "POST /admin/nft/collections/{id}/review",
  "GET /admin/nft/collections/{id}/evolution",
  "PATCH /admin/nft/collections/{collectionId}/evolution/{stageKey}",
  "POST /admin/nft/collections/{collectionId}/evolution/{stageKey}/generate-avatar",
  "POST /admin/nft/collections/{id}/analyze-legacy",
  "POST /admin/nft/collections/{id}/rpg-analyze",
  "POST /users/me/star-profiles/revalidate",
  // Internal operations consoles intentionally use authenticated customFetch
  // contracts and are not part of the public generated SDK.
  "GET /admin/audit-logs",
  "GET /admin/members",
  "GET /admin/members/{id}",
  "GET /admin/operations/overview",
  "GET /admin/roles",
  "POST /admin/roles",
  "DELETE /admin/roles/{id}",
  "GET /admin/official-ai-accounts",
  "POST /admin/official-ai-accounts",
  "PATCH /admin/official-ai-accounts/{id}",
  "POST /admin/official-ai-accounts/{id}/review",
  // Public official-account discovery currently has a hand-written client
  // because the runtime response is intentionally polymorphic.
  "GET /official-ai-accounts",
  "GET /official-ai-accounts/{slug}/runtime",
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  });
}

function routePath(pathname: string): string {
  // Express wildcards capture the rest of a path, which OpenAPI represents with
  // a path parameter. The parameter name must still match exactly below.
  return pathname.replace(/\/\*([A-Za-z0-9_]+)/g, "/{$1}").replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function serverOperations(): Set<string> {
  const operations = new Set<string>();
  const routePattern = /router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
  for (const file of sourceFiles(routesDirectory)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(routePattern)) {
      operations.add(`${match[1].toUpperCase()} ${routePath(match[2])}`);
    }
  }
  return operations;
}

function openApiOperations(): Set<string> {
  const operations = new Set<string>();
  let currentPath: string | null = null;
  let insidePaths = false;
  for (const line of readFileSync(openApiPath, "utf8").split(/\r?\n/)) {
    if (line === "paths:") {
      insidePaths = true;
      continue;
    }
    if (insidePaths && /^\S/.test(line)) break;
    const pathMatch = line.match(/^  (\/[^:]+):$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    const methodMatch = line.match(/^    (get|post|put|patch|delete):$/);
    if (currentPath && methodMatch && methods.has(methodMatch[1])) {
      operations.add(`${methodMatch[1].toUpperCase()} ${currentPath}`);
    }
  }
  return operations;
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

const server = serverOperations();
const spec = openApiOperations();
const undocumented = sorted([...server].filter((operation) => !spec.has(operation) && !exemptRoutes.has(operation)));
const staleExemptions = sorted([...exemptRoutes].filter((operation) => !server.has(operation)));
const specOnly = sorted([...spec].filter((operation) => !server.has(operation)));

if (undocumented.length > 0 || staleExemptions.length > 0 || specOnly.length > 0) {
  const sections = [
    undocumented.length > 0
      ? `Undocumented server routes (${undocumented.length}):\n${undocumented.map((operation) => `- ${operation}`).join("\n")}`
      : null,
    staleExemptions.length > 0
      ? `Stale OpenAPI exemptions (${staleExemptions.length}):\n${staleExemptions.map((operation) => `- ${operation}`).join("\n")}`
      : null,
    specOnly.length > 0
      ? `OpenAPI routes missing from the server (${specOnly.length}):\n${specOnly.map((operation) => `- ${operation}`).join("\n")}`
      : null,
  ].filter(Boolean);
  throw new Error(sections.join("\n\n"));
}

console.log(`OpenAPI coverage verified: ${server.size} server operations, ${spec.size} documented operations.`);
