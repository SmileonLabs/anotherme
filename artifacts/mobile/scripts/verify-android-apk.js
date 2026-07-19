const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function fail(message) {
  console.error(`APK verification failed: ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    fail(`${path.basename(command)} ${args.slice(0, 2).join(" ")} exited with ${result.status}`);
  }
  return result.stdout;
}

function latestTool(buildToolsRoot, name) {
  if (!fs.existsSync(buildToolsRoot)) return null;
  const versions = fs
    .readdirSync(buildToolsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = path.join(
      buildToolsRoot,
      version,
      process.platform === "win32" ? `${name}.exe` : name,
    );
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const apkPath = path.resolve(process.argv[2] || "");
const minimumVersionCode = Number(process.argv[3] || 0);
if (!apkPath || !fs.existsSync(apkPath)) fail("APK path does not exist");
if (path.extname(apkPath).toLowerCase() !== ".apk") fail("input is not an APK");

const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!androidHome) fail("ANDROID_HOME or ANDROID_SDK_ROOT is required");

const buildToolsRoot = path.join(androidHome, "build-tools");
const aapt = latestTool(buildToolsRoot, "aapt");
const apksigner = latestTool(buildToolsRoot, "apksigner");
const apkanalyzerCandidates = [
  path.join(androidHome, "cmdline-tools", "latest", "bin", process.platform === "win32" ? "apkanalyzer.bat" : "apkanalyzer"),
  path.join(androidHome, "tools", "bin", process.platform === "win32" ? "apkanalyzer.bat" : "apkanalyzer"),
];
const apkanalyzer = apkanalyzerCandidates.find(fs.existsSync);
if (!aapt || !apksigner || !apkanalyzer) fail("Android APK analysis tools are unavailable");

const badging = run(aapt, ["dump", "badging", apkPath]);
const packageMatch = badging.match(
  /package:\s+name='([^']+)'\s+versionCode='(\d+)'\s+versionName='([^']+)'/,
);
if (!packageMatch) fail("package metadata is unreadable");
const [, androidPackage, versionCodeRaw, versionName] = packageMatch;
const versionCode = Number(versionCodeRaw);
if (androidPackage !== "com.anotherme.app") fail(`unexpected package ${androidPackage}`);
if (minimumVersionCode > 0 && versionCode < minimumVersionCode) {
  fail(`versionCode ${versionCode} is lower than required ${minimumVersionCode}`);
}

const manifest = run(aapt, ["dump", "xmltree", apkPath, "AndroidManifest.xml"]);
const requiredManifestEntries = [
  "android.permission.RECORD_AUDIO",
  "android.permission.CAMERA",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.FOREGROUND_SERVICE_CAMERA",
  `${androidPackage}.call.CallForegroundService`,
];
for (const entry of requiredManifestEntries) {
  if (!manifest.includes(entry)) fail(`manifest entry missing: ${entry}`);
}

const packages = run(apkanalyzer, ["dex", "packages", "--defined-only", apkPath]);
for (const className of [
  `${androidPackage}.call.CallForegroundService`,
  `${androidPackage}.call.CallForegroundModule`,
  `${androidPackage}.call.CallForegroundPackage`,
]) {
  if (!packages.includes(className)) fail(`DEX class missing: ${className}`);
}

const packageHostClass = `${androidPackage}.MainApplication$reactNativeHost$1`;
const packageHostCode = run(apkanalyzer, [
  "dex",
  "code",
  "--class",
  packageHostClass,
  apkPath,
]);
if (!packageHostCode.includes("CallForegroundPackage")) {
  fail("MainApplication.getPackages does not register CallForegroundPackage");
}

const files = run(apkanalyzer, ["files", "list", apkPath]);
if (!files.includes("/lib/arm64-v8a/")) fail("arm64-v8a native libraries are missing");

run(apksigner, ["verify", "--verbose", apkPath]);

console.log(
  `APK verification passed: package=${androidPackage} versionName=${versionName} ` +
    `versionCode=${versionCode} foregroundModule=registered signature=valid arm64=present`,
);
