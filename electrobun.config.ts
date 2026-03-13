import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "codictate",
    identifier: "codictate.electrobun.dev",
    version: "0.0.1",
  },
  runtime: {
    // Keep the app alive when the window is closed — it lives in the tray
    exitOnLastWindowClosed: false,
  },
  build: {
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
      // -- custom key listener
      "src/bun/utils/keyboard/KeyListener": "native-helpers/KeyListener",
      // -- Whisper (vendored by preBuild, not committed to git)
      "vendors/whisper/whisper-cli": "native-helpers/whisper-cli",
      "vendors/whisper/ggml-base.en.bin": "native-helpers/ggml-base.en.bin",
      // -- Sounds
      "src/assets/start.mp3": "sounds/start.mp3",
      "src/assets/end.mp3": "sounds/end.mp3",
      // -- ffmpeg (vendored static binary, downloaded by preBuild)
      "vendors/ffmpeg/ffmpeg": "native-helpers/ffmpeg",
    },
    watchIgnore: ["dist/**"],
    mac: {
      bundleCEF: false,
      entitlements: {
        "com.apple.security.device.audio-input":
          "Microphone access for dictation recording",
      },
    },
    linux: {
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
    },
  },
  scripts: {
    preBuild: "./scripts/pre-build.ts",
    postBuild: "./scripts/post-build.ts",
  },
} satisfies ElectrobunConfig;
