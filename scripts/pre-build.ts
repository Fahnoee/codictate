// Downloads static macOS binaries and models that are too large to commit to git.
// Everything is cached in vendors/ (gitignored) so it only downloads once.
//
// - ffmpeg:      static LGPL build from evermeet.cx
// - whisper-cli: pre-built binary from whisper.cpp GitHub releases
// - ggml-base.en.bin: Whisper base English model from Hugging Face

import { join } from "path";
import { existsSync, mkdirSync, chmodSync } from "fs";

const VENDORS_DIR = "./vendors";

// ─── ffmpeg ──────────────────────────────────────────────────────────────────

const FFMPEG_DIR = join(VENDORS_DIR, "ffmpeg");
const FFMPEG_BINARY = join(FFMPEG_DIR, "ffmpeg");

async function vendorFfmpeg() {
  if (existsSync(FFMPEG_BINARY)) {
    console.log("[pre-build] ffmpeg already vendored, skipping");
    return;
  }

  mkdirSync(FFMPEG_DIR, { recursive: true });

  // evermeet.cx: static LGPL-licensed macOS builds (arm64 / universal)
  // /getrelease/ffmpeg/zip always resolves to the latest release
  const url = "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip";
  const zipPath = join(FFMPEG_DIR, "ffmpeg.zip");

  console.log("[pre-build] Downloading ffmpeg...");
  const dl = Bun.spawnSync(
    ["curl", "-L", "--progress-bar", url, "-o", zipPath],
    {
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  if (dl.exitCode !== 0)
    throw new Error("[pre-build] Failed to download ffmpeg");

  Bun.spawnSync(["unzip", "-o", zipPath, "-d", FFMPEG_DIR], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  Bun.spawnSync(["rm", zipPath]);

  if (!existsSync(FFMPEG_BINARY))
    throw new Error(`[pre-build] ffmpeg binary not found after extraction`);

  chmodSync(FFMPEG_BINARY, 0o755);
  console.log("[pre-build] ffmpeg vendored successfully");
}

// ─── whisper-cli ─────────────────────────────────────────────────────────────

// Pinned to a specific release so builds are reproducible.
// To upgrade: bump this version and delete vendors/whisper/whisper-cli.
const WHISPER_VERSION = "1.7.4";
const WHISPER_DIR = join(VENDORS_DIR, "whisper");
const WHISPER_BINARY = join(WHISPER_DIR, "whisper-cli");

async function vendorWhisperCli() {
  if (existsSync(WHISPER_BINARY)) {
    console.log("[pre-build] whisper-cli already vendored, skipping");
    return;
  }

  mkdirSync(WHISPER_DIR, { recursive: true });

  const arch = process.arch === "arm64" ? "arm64" : "x86_64";
  const assetName = `whisper-blas-bin-macos-${arch}.zip`;
  const url = `https://github.com/ggerganov/whisper.cpp/releases/download/v${WHISPER_VERSION}/${assetName}`;
  const zipPath = join(WHISPER_DIR, "whisper.zip");
  const extractDir = join(WHISPER_DIR, "extracted");

  console.log(
    `[pre-build] Downloading whisper-cli v${WHISPER_VERSION} (${arch})...`,
  );
  const dl = Bun.spawnSync(
    ["curl", "-L", "--progress-bar", url, "-o", zipPath],
    {
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  if (dl.exitCode !== 0)
    throw new Error(
      `[pre-build] Failed to download whisper-cli from:\n  ${url}`,
    );

  mkdirSync(extractDir, { recursive: true });
  Bun.spawnSync(["unzip", "-o", zipPath, "-d", extractDir], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  Bun.spawnSync(["rm", zipPath]);

  // The zip extracts to build/bin/whisper-cli — find it regardless of nesting
  const findProc = Bun.spawnSync(
    ["find", extractDir, "-name", "whisper-cli", "-type", "f"],
    { stdout: "pipe" },
  );
  const foundPath = findProc.stdout.toString().trim().split("\n")[0];

  if (!foundPath)
    throw new Error(
      "[pre-build] whisper-cli binary not found inside the downloaded archive",
    );

  Bun.spawnSync(["cp", foundPath, WHISPER_BINARY]);
  Bun.spawnSync(["rm", "-rf", extractDir]);

  chmodSync(WHISPER_BINARY, 0o755);
  console.log("[pre-build] whisper-cli vendored successfully");
}

// ─── ggml model ──────────────────────────────────────────────────────────────

const MODEL_PATH = join(WHISPER_DIR, "ggml-base.en.bin");

async function vendorWhisperModel() {
  if (existsSync(MODEL_PATH)) {
    console.log("[pre-build] ggml-base.en.bin already vendored, skipping");
    return;
  }

  mkdirSync(WHISPER_DIR, { recursive: true });

  // Hosted on Hugging Face — same model the official whisper.cpp download script pulls
  const url =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";

  console.log(
    "[pre-build] Downloading ggml-base.en.bin (~141 MB, this may take a moment)...",
  );
  const dl = Bun.spawnSync(
    ["curl", "-L", "--progress-bar", url, "-o", MODEL_PATH],
    {
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  if (dl.exitCode !== 0)
    throw new Error("[pre-build] Failed to download ggml-base.en.bin");

  console.log("[pre-build] ggml-base.en.bin vendored successfully");
}

// ─── run ─────────────────────────────────────────────────────────────────────

if (process.platform !== "darwin") {
  console.warn(
    "[pre-build] vendoring only supported on macOS for now, skipping",
  );
  process.exit(0);
}

await vendorFfmpeg();
await vendorWhisperCli();
await vendorWhisperModel();

console.log("[pre-build] All dependencies ready");
