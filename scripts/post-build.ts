// Runs after every Electrobun build (dev and production).
// Patches Info.plist with display name, usage descriptions, and dock icon.
// The launcher binary rename is skipped for dev builds because Electrobun's
// dev runner hardcodes the name "launcher" when spawning the app.

import { join } from "path";
import { existsSync, renameSync, mkdirSync, rmSync } from "fs";

const buildDir = process.env.ELECTROBUN_BUILD_DIR;
const appName = process.env.ELECTROBUN_APP_NAME;
const buildEnv = process.env.ELECTROBUN_BUILD_ENV;

if (!buildDir || !appName) {
  console.error(
    "[post-build] Missing ELECTROBUN_BUILD_DIR or ELECTROBUN_APP_NAME",
  );
  process.exit(1);
}

const contentsDir = join(buildDir, `${appName}.app`, "Contents");
const macosDir = join(contentsDir, "MacOS");
const resourcesDir = join(contentsDir, "Resources");
const plistPath = join(contentsDir, "Info.plist");

// --- Patch Info.plist ---
const plist = (command: string) =>
  Bun.spawnSync(["/usr/libexec/PlistBuddy", "-c", command, plistPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });

const setOrAdd = (key: string, value: string) => {
  const result = plist(`Set :${key} ${value}`);
  if (result.exitCode !== 0) {
    plist(`Add :${key} string ${value}`);
  }
};

setOrAdd("CFBundleDisplayName", "Codictate");
setOrAdd(
  "NSMicrophoneUsageDescription",
  '"Codictate uses the microphone to record your voice for dictation."',
);

// --- Dock icon ---
// Convert the dock icon → AppIcon.icns and set CFBundleIconFile.
// sips + iconutil are pre-installed on every Mac — no extra tooling needed.
const sourceIcon = join("src", "assets", "images", "MacDocIcon.png");

if (existsSync(sourceIcon)) {
  const iconsetDir = join(buildDir, "AppIcon.iconset");
  const icnsPath = join(resourcesDir, "AppIcon.icns");

  try {
    mkdirSync(iconsetDir, { recursive: true });
    mkdirSync(resourcesDir, { recursive: true });

    // macOS icon sizes required by the iconset format
    const sizes: { size: number; scale: number }[] = [
      { size: 16, scale: 1 },
      { size: 16, scale: 2 },
      { size: 32, scale: 1 },
      { size: 32, scale: 2 },
      { size: 128, scale: 1 },
      { size: 128, scale: 2 },
      { size: 256, scale: 1 },
      { size: 256, scale: 2 },
      { size: 512, scale: 1 },
      { size: 512, scale: 2 },
    ];

    for (const { size, scale } of sizes) {
      const px = size * scale;
      const label =
        scale === 1
          ? `icon_${size}x${size}.png`
          : `icon_${size}x${size}@2x.png`;
      const out = join(iconsetDir, label);
      Bun.spawnSync(
        ["sips", "-z", String(px), String(px), sourceIcon, "--out", out],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
    }

    const result = Bun.spawnSync(
      ["iconutil", "-c", "icns", iconsetDir, "-o", icnsPath],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    if (result.exitCode === 0) {
      setOrAdd("CFBundleIconFile", "AppIcon");
      console.log("[post-build] Dock icon set: AppIcon.icns");
    } else {
      console.warn("[post-build] iconutil failed:", result.stderr?.toString());
    }
  } catch (err) {
    console.warn("[post-build] Could not generate dock icon:", err);
  } finally {
    if (existsSync(iconsetDir)) {
      rmSync(iconsetDir, { recursive: true, force: true });
    }
  }
} else {
  console.warn(`[post-build] Dock icon source not found: ${sourceIcon}`);
}

// Rename launcher → Codictate only for distribution builds.
// Dev builds must keep the "launcher" name — Electrobun's dev runner
// spawns it by that hardcoded path and will crash otherwise.
if (buildEnv !== "dev") {
  const launcherPath = join(macosDir, "launcher");
  const newBinaryPath = join(macosDir, "Codictate");

  if (existsSync(launcherPath)) {
    renameSync(launcherPath, newBinaryPath);
    setOrAdd("CFBundleExecutable", "Codictate");
    console.log("[post-build] Renamed: launcher → Codictate");
  }
}

console.log("[post-build] Patched Info.plist");
