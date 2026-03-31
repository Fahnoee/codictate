// Downloads/builds binaries and models that are too large to commit to git.
// Everything is cached in vendors/ (gitignored) so it only runs once.
//
// - MicRecorder:     built from Swift via `bun run build:native` (Core Audio capture + device list)
// - whisper-cli:     built from source (whisper.cpp no longer ships macOS binaries)
// - ggml-small.bin (or base): Whisper multilingual model from Hugging Face

import { join } from "path";
import { existsSync, mkdirSync, chmodSync } from "fs";

const VENDORS_DIR = "./vendors";

// ─── whisper-cli ─────────────────────────────────────────────────────────────

// whisper.cpp stopped shipping macOS binary releases after v1.7.4.
// We build from source instead — this produces a fully static binary
// (no dylib dependencies beyond macOS system frameworks) that works on any Mac.
//
// To upgrade: bump this version and delete vendors/whisper/whisper-cli.
// Requires: cmake (install with `brew install cmake` if missing)
const WHISPER_VERSION = "1.8.3";
const WHISPER_DIR = join(VENDORS_DIR, "whisper");
const WHISPER_BINARY = join(WHISPER_DIR, "whisper-cli");

async function vendorWhisperCli() {
  if (existsSync(WHISPER_BINARY)) {
    console.log("[pre-build] whisper-cli already vendored, skipping");
    return;
  }

  // Verify cmake is available before doing any work
  const cmakeCheck = Bun.spawnSync(["cmake", "--version"], { stdout: "pipe" });
  if (cmakeCheck.exitCode !== 0)
    throw new Error(
      "[pre-build] cmake not found. Install it with: brew install cmake",
    );

  mkdirSync(WHISPER_DIR, { recursive: true });

  const sourceUrl = `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v${WHISPER_VERSION}.tar.gz`;
  const tarPath = join(WHISPER_DIR, "whisper-src.tar.gz");
  const srcDir = join(WHISPER_DIR, "whisper-src");
  const buildDir = join(WHISPER_DIR, "whisper-build");

  console.log(
    `[pre-build] Downloading whisper.cpp v${WHISPER_VERSION} source...`,
  );
  const dl = Bun.spawnSync(
    ["curl", "-L", "--progress-bar", sourceUrl, "-o", tarPath],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  if (dl.exitCode !== 0)
    throw new Error("[pre-build] Failed to download whisper.cpp source");

  mkdirSync(srcDir, { recursive: true });
  Bun.spawnSync(["tar", "-xf", tarPath, "-C", srcDir, "--strip-components=1"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  Bun.spawnSync(["rm", "-f", tarPath]);

  console.log("[pre-build] Configuring whisper-cli (static build)...");
  const configure = Bun.spawnSync(
    [
      "cmake",
      "-S", srcDir,
      "-B", buildDir,
      "-DCMAKE_BUILD_TYPE=Release",
      // Build all internal libs as static — whisper-cli ends up with no
      // external dylib deps beyond macOS system frameworks (Metal, libc++, etc.)
      "-DBUILD_SHARED_LIBS=OFF",
      "-DWHISPER_BUILD_TESTS=OFF",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  if (configure.exitCode !== 0) {
    Bun.spawnSync(["rm", "-rf", srcDir, buildDir]);
    throw new Error("[pre-build] cmake configure failed");
  }

  const cpuResult = Bun.spawnSync(["sysctl", "-n", "hw.ncpu"], {
    stdout: "pipe",
  });
  const jobs = cpuResult.stdout.toString().trim() || "4";

  console.log(
    `[pre-build] Building whisper-cli (${jobs} cores, ~2-3 min first time)...`,
  );
  const build = Bun.spawnSync(
    ["cmake", "--build", buildDir, "--target", "whisper-cli", "-j", jobs],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  if (build.exitCode !== 0) {
    Bun.spawnSync(["rm", "-rf", srcDir, buildDir]);
    throw new Error("[pre-build] whisper-cli build failed");
  }

  const findProc = Bun.spawnSync(
    ["find", buildDir, "-name", "whisper-cli", "-type", "f"],
    { stdout: "pipe" },
  );
  const foundPath = findProc.stdout.toString().trim().split("\n")[0];

  if (!foundPath) {
    Bun.spawnSync(["rm", "-rf", srcDir, buildDir]);
    throw new Error("[pre-build] whisper-cli binary not found after build");
  }

  Bun.spawnSync(["cp", foundPath, WHISPER_BINARY]);
  Bun.spawnSync(["rm", "-rf", srcDir, buildDir]);

  chmodSync(WHISPER_BINARY, 0o755);
  console.log("[pre-build] whisper-cli built and vendored successfully");
}

// ─── ggml model ──────────────────────────────────────────────────────────────

// We landed on this model becuase it can detect
// multiple languages and it is fast and very accurate.
const MODEL_NAME = "ggml-large-v3-turbo-q5_0.bin";
const MODEL_PATH = join(WHISPER_DIR, MODEL_NAME);

async function vendorWhisperModel() {
  if (existsSync(MODEL_PATH)) {
    console.log(`[pre-build] ${MODEL_NAME} already vendored, skipping`);
    return;
  }

  mkdirSync(WHISPER_DIR, { recursive: true });

  // Hosted on Hugging Face — same model the official whisper.cpp download script pulls
  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}`;

  console.log(
    `[pre-build] Downloading ${MODEL_NAME} (~547 MB, this may take a moment)...`,
  );
  const dl = Bun.spawnSync(
    ["curl", "-L", "--progress-bar", url, "-o", MODEL_PATH],
    {
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  if (dl.exitCode !== 0)
    throw new Error(`[pre-build] Failed to download ${MODEL_NAME}`);

  console.log(`[pre-build] ${MODEL_NAME} vendored successfully`);
}

// ─── run ─────────────────────────────────────────────────────────────────────

if (process.platform !== "darwin") {
  console.warn(
    "[pre-build] vendoring only supported on macOS for now, skipping",
  );
  process.exit(0);
}

await vendorWhisperCli();
await vendorWhisperModel();

console.log("[pre-build] All dependencies ready");
