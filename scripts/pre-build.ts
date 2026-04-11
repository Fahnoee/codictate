// Downloads/builds binaries and models that are too large to commit to git.
// Everything is cached in vendors/ (gitignored) so it only runs once.
//
// - MicRecorder:       built from Swift via `bun run build:native` (Core Audio capture + device list)
// - whisper-cli:       built from source (whisper.cpp)
// - CodictateParakeetHelper: Swift + FluidAudio + NeMo ITN (text-processing-rs static lib)
// - ggml-large-v3-turbo-q5_0.bin: Whisper multilingual model from Hugging Face
//
// Dev setup: brew install cmake, Xcode + swift for the Parakeet helper.

import { join } from "path";
import { existsSync, mkdirSync, chmodSync } from "fs";

const VENDORS_DIR = "./vendors";

const WHISPER_VERSION = "1.8.3";
const WHISPER_DIR = join(VENDORS_DIR, "whisper");
const WHISPER_BINARY = join(WHISPER_DIR, "whisper-cli");

const PARAKEET_PKG = join(import.meta.dir, "..", "native", "CodictateParakeetHelper");
const PARAKEET_DIR = join(VENDORS_DIR, "parakeet");
const PARAKEET_BINARY = join(PARAKEET_DIR, "CodictateParakeetHelper");
const TEXT_PROCESSING_RS_DIR = join(import.meta.dir, "..", "vendors", "text-processing-rs");
const NEMO_STATIC_LIB = join(
  PARAKEET_PKG,
  "Vendor",
  "lib",
  "libtext_processing_rs.a",
);

function resolveCargoExecutable(): string {
  const which = Bun.spawnSync(["/usr/bin/which", "cargo"], { stdout: "pipe" });
  if (which.exitCode === 0) {
    const p = which.stdout.toString().trim();
    if (p) return p;
  }
  const home = process.env.HOME;
  const fallback = home ? join(home, ".cargo", "bin", "cargo") : "";
  if (fallback && existsSync(fallback)) return fallback;
  throw new Error(
    "[pre-build] cargo not found. Install Rust: https://rustup.rs",
  );
}

async function vendorWhisperBinaries() {
  if (existsSync(WHISPER_BINARY)) {
    console.log("[pre-build] whisper-cli already vendored, skipping");
    return;
  }

  const cmakeCheck = Bun.spawnSync(["cmake", "--version"], { stdout: "pipe" });
  if (cmakeCheck.exitCode !== 0) {
    throw new Error(
      "[pre-build] cmake not found. Install it with: brew install cmake",
    );
  }

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
  if (dl.exitCode !== 0) {
    throw new Error("[pre-build] Failed to download whisper.cpp source");
  }

  mkdirSync(srcDir, { recursive: true });
  Bun.spawnSync(["tar", "-xf", tarPath, "-C", srcDir, "--strip-components=1"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  Bun.spawnSync(["rm", "-f", tarPath]);

  console.log("[pre-build] Configuring whisper-cli (static, no SDL2)...");
  const configure = Bun.spawnSync(
    [
      "cmake",
      "-S", srcDir,
      "-B", buildDir,
      "-DCMAKE_BUILD_TYPE=Release",
      "-DBUILD_SHARED_LIBS=OFF",
      "-DWHISPER_BUILD_TESTS=OFF",
      "-DWHISPER_BUILD_EXAMPLES=OFF",
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
    `[pre-build] Building whisper-cli (${jobs} cores, ~3-5 min first time)...`,
  );
  const build = Bun.spawnSync(
    ["cmake", "--build", buildDir, "--target", "whisper-cli", "-j", jobs],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  if (build.exitCode !== 0) {
    Bun.spawnSync(["rm", "-rf", srcDir, buildDir]);
    throw new Error("[pre-build] whisper-cli build failed");
  }

  const findCli = Bun.spawnSync(
    ["find", buildDir, "-name", "whisper-cli", "-type", "f"],
    { stdout: "pipe" },
  );
  const cliPath = findCli.stdout.toString().trim().split("\n")[0];

  if (!cliPath) {
    Bun.spawnSync(["rm", "-rf", srcDir, buildDir]);
    throw new Error("[pre-build] whisper-cli binary not found after build");
  }

  Bun.spawnSync(["cp", cliPath, WHISPER_BINARY]);
  chmodSync(WHISPER_BINARY, 0o755);
  console.log("[pre-build] whisper-cli built and vendored successfully");

  Bun.spawnSync(["rm", "-rf", srcDir, buildDir]);
}

function parakeetVendoredBinaryLooksExecutable(path: string): boolean {
  if (!existsSync(path)) return false;
  const ft = Bun.spawnSync(["file", "-b", path], { stdout: "pipe" });
  const desc = ft.stdout.toString();
  // `find` previously picked `…/CodictateParakeetHelper.dSYM/.../CodictateParakeetHelper`
  // (a dSYM companion) → ENOEXEC at runtime. Require a real Mach-O executable.
  return (
    desc.includes("Mach-O") &&
    desc.includes("executable") &&
    !desc.includes("dSYM")
  );
}

/** Build FluidInference/text-processing-rs (NeMo ITN FFI) and place the static lib where Swift links it. */
async function vendorNemoTextProcessingStaticLib() {
  const cargo = resolveCargoExecutable();
  const cargoVersion = Bun.spawnSync([cargo, "--version"], { stdout: "pipe" });
  if (cargoVersion.exitCode !== 0) {
    throw new Error("[pre-build] cargo exists but does not run — check Rust install");
  }

  mkdirSync(join(import.meta.dir, "..", "vendors"), { recursive: true });

  if (!existsSync(join(TEXT_PROCESSING_RS_DIR, "Cargo.toml"))) {
    console.log(
      "[pre-build] Cloning FluidInference/text-processing-rs (NeMo inverse text normalization)…",
    );
    const clone = Bun.spawnSync(
      [
        "git",
        "clone",
        "--depth",
        "1",
        "https://github.com/FluidInference/text-processing-rs.git",
        TEXT_PROCESSING_RS_DIR,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    if (clone.exitCode !== 0) {
      throw new Error("[pre-build] git clone text-processing-rs failed");
    }
  }

  console.log(
    "[pre-build] Building text-processing-rs (host target, release, ffi) for Parakeet ITN…",
  );
  const cargoBuild = Bun.spawnSync(
    [cargo, "build", "--release", "--features", "ffi"],
    {
      cwd: TEXT_PROCESSING_RS_DIR,
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  if (cargoBuild.exitCode !== 0) {
    throw new Error("[pre-build] cargo build text-processing-rs failed");
  }

  const builtLib = join(
    TEXT_PROCESSING_RS_DIR,
    "target",
    "release",
    "libtext_processing_rs.a",
  );
  if (!existsSync(builtLib)) {
    throw new Error(`[pre-build] Expected static lib at ${builtLib}`);
  }

  mkdirSync(join(PARAKEET_PKG, "Vendor", "lib"), { recursive: true });
  Bun.spawnSync(["cp", "-f", builtLib, NEMO_STATIC_LIB]);
  console.log("[pre-build] NeMo ITN static library ready for CodictateParakeetHelper link step");
}

async function vendorParakeetHelper() {
  if (
    existsSync(PARAKEET_BINARY) &&
    !parakeetVendoredBinaryLooksExecutable(PARAKEET_BINARY)
  ) {
    console.log(
      "[pre-build] Replacing invalid CodictateParakeetHelper (not a Mach-O executable — often a dSYM stub)",
    );
    Bun.spawnSync(["rm", "-f", PARAKEET_BINARY]);
  }

  const swiftCheck = Bun.spawnSync(["xcrun", "--find", "swift"], {
    stdout: "pipe",
  });
  if (swiftCheck.exitCode !== 0) {
    throw new Error(
      "[pre-build] Swift toolchain not found. Install Xcode and run: xcode-select --install",
    );
  }

  if (!existsSync(join(PARAKEET_PKG, "Package.swift"))) {
    throw new Error(
      `[pre-build] Missing ${PARAKEET_PKG}/Package.swift — cannot build Parakeet helper`,
    );
  }

  await vendorNemoTextProcessingStaticLib();

  console.log(
    "[pre-build] Building CodictateParakeetHelper (Swift + FluidAudio + NeMo ITN; first run resolves SPM and Rust FFI)...",
  );
  const build = Bun.spawnSync(["swift", "build", "-c", "release"], {
    cwd: PARAKEET_PKG,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (build.exitCode !== 0) {
    throw new Error("[pre-build] swift build CodictateParakeetHelper failed");
  }

  const binPathRes = Bun.spawnSync(
    ["swift", "build", "-c", "release", "--show-bin-path"],
    { cwd: PARAKEET_PKG, stdout: "pipe" },
  );
  if (binPathRes.exitCode !== 0) {
    throw new Error("[pre-build] swift --show-bin-path failed");
  }
  const releaseDir = binPathRes.stdout.toString().trim();
  const built = join(releaseDir, "CodictateParakeetHelper");

  if (!existsSync(built)) {
    throw new Error(
      `[pre-build] CodictateParakeetHelper not at ${built} (swift build layout changed?)`,
    );
  }

  const verify = Bun.spawnSync(["file", "-b", built], { stdout: "pipe" });
  const verifyDesc = verify.stdout.toString();
  if (!verifyDesc.includes("Mach-O") || !verifyDesc.includes("executable")) {
    throw new Error(
      `[pre-build] Expected Mach-O executable at ${built}, got: ${verifyDesc.trim()}`,
    );
  }

  mkdirSync(PARAKEET_DIR, { recursive: true });
  Bun.spawnSync(["cp", built, PARAKEET_BINARY]);
  chmodSync(PARAKEET_BINARY, 0o755);
  console.log("[pre-build] CodictateParakeetHelper vendored successfully");
}

const MODEL_NAME = "ggml-large-v3-turbo-q5_0.bin";
const MODEL_PATH = join(WHISPER_DIR, MODEL_NAME);

async function vendorWhisperModel() {
  if (existsSync(MODEL_PATH)) {
    console.log(`[pre-build] ${MODEL_NAME} already vendored, skipping`);
    return;
  }

  mkdirSync(WHISPER_DIR, { recursive: true });

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
  if (dl.exitCode !== 0) {
    throw new Error(`[pre-build] Failed to download ${MODEL_NAME}`);
  }

  console.log(`[pre-build] ${MODEL_NAME} vendored successfully`);
}

if (process.platform !== "darwin") {
  console.warn(
    "[pre-build] vendoring only supported on macOS for now, skipping",
  );
  process.exit(0);
}

if (process.argv.includes("--parakeet-only")) {
  await vendorParakeetHelper();
  console.log("[pre-build] Parakeet helper (+ NeMo ITN) ready");
  process.exit(0);
}

await vendorWhisperBinaries();
await vendorParakeetHelper();
await vendorWhisperModel();

console.log("[pre-build] All dependencies ready");
