// Runs after every Electrobun build (dev and production).
// Patches Info.plist with display name and usage descriptions.
// The launcher binary rename is skipped for dev builds because Electrobun's
// dev runner hardcodes the name "launcher" when spawning the app.

import { join } from "path";
import { existsSync, renameSync } from "fs";

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
