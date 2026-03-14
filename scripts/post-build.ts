// Runs inside Electrobun's build pipeline after the .app bundle is assembled.
// Electrobun reads icon.iconset/ directly (mac.icons in electrobun.config.ts).
// The iconset is committed to the repo, but this script regenerates missing
// sizes so a fresh clone still builds correctly.

import { join } from "path";
import { existsSync, renameSync, readdirSync, mkdirSync } from "fs";

const buildDir = process.env.ELECTROBUN_BUILD_DIR;
const buildEnv = process.env.ELECTROBUN_BUILD_ENV;

if (!buildDir) {
  console.error("[post-build] Missing ELECTROBUN_BUILD_DIR");
  process.exit(1);
}

const appBundle = readdirSync(buildDir).find((f) => f.endsWith(".app"));
if (!appBundle) {
  console.error(`[post-build] No .app bundle found in ${buildDir}`);
  process.exit(1);
}
console.log(`[post-build] Patching bundle: ${appBundle}`);

const contentsDir = join(buildDir, appBundle, "Contents");
const macosDir = join(contentsDir, "MacOS");
const plistPath = join(contentsDir, "Info.plist");

// ─── Patch Info.plist ─────────────────────────────────────────────────────────

const plist = (command: string) =>
  Bun.spawnSync(["/usr/libexec/PlistBuddy", "-c", command, plistPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });

const setOrAdd = (key: string, value: string) => {
  const result = plist(`Set :${key} ${value}`);
  if (result.exitCode !== 0) plist(`Add :${key} string ${value}`);
};

setOrAdd("CFBundleDisplayName", "Codictate");
setOrAdd(
  "NSMicrophoneUsageDescription",
  '"Codictate uses the microphone to record your voice for dictation."',
);

// ─── Ensure icon.iconset is populated ────────────────────────────────────────

const iconsetDir = join(import.meta.dir, "..", "icon.iconset");
const sourceIcon = join(import.meta.dir, "..", "src", "assets", "images", "MacDocIcon.png");

const iconSizes = [
  { size: 16, scale: 1 }, { size: 16, scale: 2 },
  { size: 32, scale: 1 }, { size: 32, scale: 2 },
  { size: 128, scale: 1 }, { size: 128, scale: 2 },
  { size: 256, scale: 1 }, { size: 256, scale: 2 },
  { size: 512, scale: 1 }, { size: 512, scale: 2 },
];

if (existsSync(sourceIcon)) {
  const missing = iconSizes.filter(({ size, scale }) => {
    const label = scale === 1 ? `icon_${size}x${size}.png` : `icon_${size}x${size}@2x.png`;
    return !existsSync(join(iconsetDir, label));
  });

  if (missing.length > 0) {
    mkdirSync(iconsetDir, { recursive: true });
    for (const { size, scale } of missing) {
      const px = size * scale;
      const label = scale === 1 ? `icon_${size}x${size}.png` : `icon_${size}x${size}@2x.png`;
      Bun.spawnSync(
        ["sips", "-z", String(px), String(px), sourceIcon, "--out", join(iconsetDir, label)],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
    }
    console.log(`[post-build] Generated ${missing.length} missing icon(s) in icon.iconset/`);
  }
}

// ─── Rename launcher binary (non-dev only) ────────────────────────────────────

if (buildEnv !== "dev") {
  const launcherPath = join(macosDir, "launcher");
  const newBinaryPath = join(macosDir, "Codictate");
  if (existsSync(launcherPath)) {
    renameSync(launcherPath, newBinaryPath);
    setOrAdd("CFBundleExecutable", "Codictate");
    console.log("[post-build] Renamed: launcher → Codictate");
  }
}

console.log("[post-build] Done");
