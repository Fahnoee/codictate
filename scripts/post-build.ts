// Runs inside Electrobun's build pipeline after the .app bundle is assembled.
// Electrobun reads icon.iconset/ directly (mac.icons in electrobun.config.ts).
// The iconset is committed to the repo, but this script regenerates missing
// sizes so a fresh clone still builds correctly.

import { join } from "path";
import {
  existsSync,
  readdirSync,
  mkdirSync,
} from "fs";

const buildDir = process.env.ELECTROBUN_BUILD_DIR;

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
const resourcesDir = join(contentsDir, "Resources");
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

setOrAdd(
  "NSMicrophoneUsageDescription",
  '"Codictate uses the microphone to record your voice for dictation."',
);
// Required on current macOS for system permission dialogs to appear for signed apps.
// Without these, CGRequestListenEventAccess / accessibility prompts can fail silently.
setOrAdd(
  "NSInputMonitoringUsageDescription",
  '"Codictate listens for your global dictation shortcut while you use other apps."',
);
setOrAdd(
  "NSAccessibilityUsageDescription",
  '"Codictate uses accessibility to paste transcribed text into the app that has focus."',
);

// Do NOT rename the `launcher` binary — Electrobun's codesignAppBundle() signs
// `Contents/MacOS/launcher` by path; renaming breaks TCC / System Settings listing.
//
// CFBundleName (and the .app folder name) already come from electrobun.config.ts
// `app.name` + `--env` via Electrobun's getMacOSBundleDisplayName — no PlistBuddy
// needed here for display naming.

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

// AppLauncher swap was removed.
//
// Rationale: With a signed/notarized build the Bun runtime must remain the
// CFBundleExecutable so that macOS Launch Services registers it as the
// "responsible process" for the app bundle. Subprocesses (KeyListener, etc.)
// inherit that responsibility and their CGRequestListenEventAccess / TCC calls
// are attributed to app.codictate.canary correctly.
//
// Inserting an AppLauncher shim as CFBundleExecutable pushes Bun one level
// down the process tree (grandchild relationship with KeyListener), breaking
// TCC attribution on macOS 13+.  The premature CGRequestListenEventAccess()
// call in AppLauncher (before any UI window exists) also consumed the one-shot
// TCC dialog opportunity, preventing subsequent calls from showing the sheet.

// ─── Compile iconset → .icns and embed in bundle ──────────────────────────────
// Without CFBundleIconFile + a valid .icns in Resources/, macOS shows a generic
// icon in permission dialogs (Accessibility, Microphone, etc.).

if (existsSync(iconsetDir)) {
  const icnsPath = join(resourcesDir, "AppIcon.icns");
  mkdirSync(resourcesDir, { recursive: true });
  const result = Bun.spawnSync(
    ["iconutil", "-c", "icns", iconsetDir, "--output", icnsPath],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.exitCode === 0) {
    setOrAdd("CFBundleIconFile", "AppIcon");
    console.log("[post-build] Compiled icon.iconset → AppIcon.icns");
  } else {
    console.warn("[post-build] iconutil failed — icon may be missing in permission dialogs");
  }
}

// ─── Sign bundled native helpers (required for notarization) ────────────────
// Electrobun signs MacOS/, Frameworks/, and Resources/app/bun/**/*.node but does
// not sign arbitrary executables under Resources/app/. Apple notarization rejects
// any unsigned Mach-O inside the zip, so we Developer ID–sign helpers here with
// hardened runtime + secure timestamp — same flags Electrobun uses elsewhere.
//
// Each helper must embed its own entitlements: with `--options runtime`, macOS
// denies mic / ML capabilities unless the binary declares them (silent failure or
// stale TCC behavior). See entitlements/*.entitlements.
//
// Runs before Electrobun's codesignAppBundle (see node_modules/electrobun/...).

const developerId = process.env.ELECTROBUN_DEVELOPER_ID;

// Electrobun always sets ELECTROBUN_APP_IDENTIFIER from electrobun.config.ts
// (app.identifier ← CODICTATE_CHANNEL): canary → app.codictate.canary,
// dev → app.codictate.dev, stable → app.codictate.
// Fallbacks only if the hook is run without that env (e.g. manual script run).
function resolveAppIdentifier(): string {
  const fromElectrobun = process.env.ELECTROBUN_APP_IDENTIFIER?.trim();
  if (fromElectrobun) return fromElectrobun;

  const env = process.env.ELECTROBUN_BUILD_ENV;
  if (env === "canary") return "app.codictate.canary";
  if (env === "dev") return "app.codictate.dev";
  return "app.codictate";
}

const appIdentifier = resolveAppIdentifier();
const nativeHelpersDir = join(resourcesDir, "app", "native-helpers");
const nativeHelperNames = ["KeyListener", "MicRecorder", "whisper-cli"] as const;
const entitlementsRoot = join(import.meta.dir, "..", "entitlements");
const helperEntitlements: Record<(typeof nativeHelperNames)[number], string> = {
  KeyListener: join(entitlementsRoot, "KeyListener.entitlements"),
  MicRecorder: join(entitlementsRoot, "MicRecorder.entitlements"),
  "whisper-cli": join(entitlementsRoot, "whisper-cli.entitlements"),
};
const CODESIGN_RETRIES = 3;

if (developerId && existsSync(nativeHelpersDir)) {
  for (const name of nativeHelperNames) {
    const binaryPath = join(nativeHelpersDir, name);
    if (!existsSync(binaryPath)) continue;

    const id = `${appIdentifier}.native.${name.toLowerCase().replace(/-/g, "")}`;
    const entitlementsPath = helperEntitlements[name];
    const entitlementArgs =
      existsSync(entitlementsPath) ? (["--entitlements", entitlementsPath] as const) : [];
    if (entitlementArgs.length === 0) {
      console.warn(
        `[post-build] Missing entitlements for ${name} at ${entitlementsPath} — signing without`,
      );
    }

    console.log(`[post-build] codesign native helper: ${name}`);
    let signed = false;
    for (let attempt = 1; attempt <= CODESIGN_RETRIES; attempt += 1) {
      const result = Bun.spawnSync(
        [
          "codesign",
          "--force",
          "--verbose",
          "--timestamp",
          "--options",
          "runtime",
          "--sign",
          developerId,
          "--identifier",
          id,
          ...entitlementArgs,
          binaryPath,
        ],
        { stdio: ["ignore", "inherit", "inherit"] },
      );
      if (result.exitCode === 0) {
        signed = true;
        break;
      }
      if (attempt < CODESIGN_RETRIES) {
        console.warn(
          `[post-build] codesign retry ${attempt}/${CODESIGN_RETRIES - 1} for native-helpers/${name}`,
        );
      }
    }
    if (!signed) {
      console.error(`[post-build] codesign failed for native-helpers/${name}`);
      process.exit(1);
    }
  }
}

// ─── Releases are handled by scripts/release.sh ──────────────────────────────
// Run: bun run release:canary  /  bun run release:stable  /  bun run release

console.log("[post-build] Done");
