// Zip dist/ into release/personality-matrix-<version>.zip for private client installs
// (chrome://extensions → Developer mode → Load unpacked, after unzipping).
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const { version } = JSON.parse(readFileSync("public/manifest.json", "utf8"));
const out = resolve("release", `personality-matrix-${version}.zip`);
mkdirSync("release", { recursive: true });
rmSync(out, { force: true });

if (process.platform === "win32") {
  // Windows' built-in bsdtar, by absolute path so Git Bash's GNU tar (no zip support) can't shadow it.
  // Not Compress-Archive: PowerShell 5.1 writes backslash separators, which non-Windows unzip tools mangle.
  // Entries go at the zip root so manifest.json is top-level after unzipping.
  const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  execFileSync(tar, ["-a", "-cf", out, "-C", "dist", ...readdirSync("dist")], { stdio: "inherit" });
} else {
  execFileSync("zip", ["-rq", out, "."], { cwd: "dist", stdio: "inherit" });
}
console.log(`Packaged ${out}`);
