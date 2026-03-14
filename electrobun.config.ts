import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Codictate",
    identifier: "com.codictate",
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
      // -- Sounds (src/assets/sounds → app/sounds)
      "src/assets/sounds/dictation-start.wav": "sounds/dictation-start.wav",
      "src/assets/sounds/dictation-stop.wav": "sounds/dictation-stop.wav",
      "src/assets/sounds/start.mp3": "sounds/start.mp3",
      "src/assets/sounds/end.mp3": "sounds/end.mp3",
      // -- Images (src/assets/images → app/images)
      "src/assets/images/MacTrayIcon.svg": "images/MacTrayIcon.svg",
      "src/assets/images/MacDocIcon.png": "images/MacDocIcon.png",
      // -- ffmpeg (vendored static binary, downloaded by preBuild)
      "vendors/ffmpeg/ffmpeg": "native-helpers/ffmpeg",
    },
    watchIgnore: ["dist/**"],
    mac: {
      icons: "icon.iconset",
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
