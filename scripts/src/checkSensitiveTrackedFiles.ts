import { execFileSync } from "node:child_process";

const forbidden = [
  /(^|\/)google-services\.json$/i,
  /(^|\/)\.env(?:\.|$)/i,
  /\.(?:pem|keystore|jks)$/i,
];

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const violations = tracked.filter((file) => forbidden.some((pattern) => pattern.test(file)));

if (violations.length > 0) {
  console.error("금지된 로컬 전용 파일이 Git에 추적되고 있습니다:");
  for (const file of violations) console.error(`- ${file}`);
  process.exit(1);
}

console.log("민감 로컬 파일 Git 추적 검사를 통과했습니다.");
