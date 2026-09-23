// Zip dist/ into release/personality-matrix-<version>.zip for private client installs
// (chrome://extensions → Developer mode → Load unpacked, after unzipping).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const { version } = JSON.parse(readFileSync("public/manifest.json", "utf8"));
const out = resolve("release", `personality-matrix-${version}.zip`);
mkdirSync("release", { recursive: true });
rmSync(out, { force: true });

if (process.platform === "win32") {
  execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path dist\* -DestinationPath '${out}'`], { stdio: "inherit" });
} else {
  execFileSync("zip", ["-rq", out, "."], { cwd: "dist", stdio: "inherit" });
}
console.log(`Packaged ${out}`);
