/**
 * Production build for the browser PWA (real web app).
 *
 * Runs `expo export -p web` to produce a static single-page web build in
 * ./web-build (index.html + _expo/static/... + assets). The deployment then
 * serves this with server/serve.js as an SPA at the artifact base path (/app/).
 *
 * This REPLACES the previous "Open in Expo Go" launcher build. It does NOT
 * affect native EAS (APK/iOS) builds, which run off-platform from app.json.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const OUTPUT_DIR = "web-build";

function stripProtocol(domain) {
  let urlString = domain.trim();
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }
  return new URL(urlString).host;
}

function getDeploymentDomain() {
  const domain =
    process.env.REPLIT_INTERNAL_APP_DOMAIN ||
    process.env.REPLIT_DEV_DOMAIN ||
    process.env.EXPO_PUBLIC_DOMAIN;

  if (!domain) {
    console.error(
      "ERROR: No deployment domain found. Set REPLIT_INTERNAL_APP_DOMAIN, REPLIT_DEV_DOMAIN, or EXPO_PUBLIC_DOMAIN",
    );
    process.exit(1);
  }
  return stripProtocol(domain);
}

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      cwd: projectRoot,
      env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function main() {
  const domain = getDeploymentDomain();
  console.log(`Building browser web export (PWA) for https://${domain} ...`);

  const outPath = path.join(projectRoot, OUTPUT_DIR);
  if (fs.existsSync(outPath)) {
    fs.rmSync(outPath, { recursive: true, force: true });
  }

  // EXPO_PUBLIC_* vars are inlined into the web bundle at build time, so they
  // must be present here (unlike the dev server, which reads them at runtime).
  const clerkKey =
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    process.env.CLERK_PUBLISHABLE_KEY ||
    "";
  if (!clerkKey) {
    console.error(
      "ERROR: No Clerk publishable key found (EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_PUBLISHABLE_KEY). " +
        "The web app cannot bootstrap auth without it — building would produce a blank error page. " +
        "Set the key in the deployment environment and rebuild.",
    );
    process.exit(1);
  }

  const env = {
    ...process.env,
    // Reduce Metro worker count to keep the web export within memory limits.
    EXPO_WEB_EXPORT: "1",
    EXPO_PUBLIC_DOMAIN: domain,
    EXPO_PUBLIC_REPL_ID:
      process.env.REPL_ID || process.env.EXPO_PUBLIC_REPL_ID || "",
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: clerkKey,
    // Production-only: a pk_live Clerk instance resolves its Frontend API at
    // clerk.<domain>, which has no DNS on *.replit.app. Route Clerk through the
    // api-server proxy (/api/__clerk) instead so the browser can reach it.
    // build.js only runs for the production deploy, so this never leaks to dev.
    EXPO_PUBLIC_CLERK_PROXY_URL:
      process.env.EXPO_PUBLIC_CLERK_PROXY_URL || `https://${domain}/api/__clerk`,
  };

  // experiments.baseUrl is WEB-ONLY here, but expo-router bakes it into the
  // NATIVE bundle too (production builds prefix/strip routes with it), which
  // breaks the APK with a "+not-found" screen. So the committed app.json must
  // NOT contain baseUrl. We inject it only for this web export and restore the
  // file afterward (even on failure), so EAS native builds stay correct.
  const appJsonPath = path.join(projectRoot, "app.json");
  const originalAppJson = fs.readFileSync(appJsonPath, "utf8");
  const appConfig = JSON.parse(originalAppJson);
  appConfig.expo = appConfig.expo || {};
  appConfig.expo.experiments = appConfig.expo.experiments || {};
  appConfig.expo.experiments.baseUrl = "/app";
  fs.writeFileSync(appJsonPath, JSON.stringify(appConfig, null, 2) + "\n");

  try {
    await run(
      "pnpm",
      ["exec", "expo", "export", "-p", "web", "--output-dir", OUTPUT_DIR],
      env,
    );
  } finally {
    // Always restore the committed app.json (no baseUrl) for native builds.
    fs.writeFileSync(appJsonPath, originalAppJson);
  }

  const indexHtml = path.join(outPath, "index.html");
  if (!fs.existsSync(indexHtml)) {
    console.error(
      `Build failed: ${OUTPUT_DIR}/index.html was not produced by expo export.`,
    );
    process.exit(1);
  }

  console.log(`Web build complete: ${outPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Build failed:", error.message);
  process.exit(1);
});
