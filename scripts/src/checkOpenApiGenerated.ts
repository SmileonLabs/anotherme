import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const generatedPaths = [
  "lib/api-client-react/src/generated",
  "lib/api-zod/src/generated",
];

function run(command: string, args: string[], capture = false): string {
  return execFileSync(command, args, {
    cwd: root,
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? "pipe" : "inherit",
    shell: process.platform === "win32",
  }) as string;
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
run(pnpm, ["--filter", "@workspace/api-spec", "run", "codegen"]);
run("git", ["diff", "--quiet", "--exit-code", "--", ...generatedPaths]);

const status = run(
  "git",
  ["status", "--porcelain", "--untracked-files=all", "--", ...generatedPaths],
  true,
);
const untracked = status
  .split("\n")
  .filter((line) => line.startsWith("??"));
if (untracked.length > 0) {
  throw new Error(`OpenAPI generation created untracked files:\n${untracked.join("\n")}`);
}

run(pnpm, ["--filter", "@workspace/scripts", "exec", "tsx", "./src/checkOpenApiRouteCoverage.ts"]);
