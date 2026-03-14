# Codictate

macOS dictation app built with Electrobun, React, and Bun. Press a shortcut, speak, and your transcribed text is pasted wherever your cursor is.

## Development

```bash
bun install

# Dev (no HMR)
bun run dev

# Dev with HMR (recommended — Vite hot reload)
bun run dev:hmr
```

## Building

```bash
bun run build:canary    # canary build
bun run build:stable    # stable build
bun run build:all       # both
```

Builds require a `.env` file in the project root. Copy `.env.example` and fill in your values:

```bash
cp .env.example .env
```

## Releasing

```bash
bun run release:canary    # bump version, build, publish canary
bun run release:stable    # bump version, build, publish stable
bun run release           # both channels
```

Each release:
1. Bumps the patch version in `electrobun.config.ts`
2. Runs the full build
3. Creates a versioned GitHub release (e.g. `v0.0.2-canary`) with all artifacts
4. Updates the fixed `canary` / `stable` pointer release with `update.json` for the in-app updater

After releasing, commit the version bump:
```bash
git add electrobun.config.ts && git commit -m "chore: bump version to vX.X.X"
```

Artifacts are published to [EmilLykke/codictate-releases](https://github.com/EmilLykke/codictate-releases).

## Project Structure

```
src/
  bun/                  # Main process (Bun/Electrobun)
    index.ts            # App entry point
    setup-window.ts     # Window + RPC setup
    setup-tray.ts       # Tray menu
    setup-menu.ts       # Application menu
    setup-recording.ts  # Keyboard listener + recording pipeline
    AppConfig/          # User settings persistence
    utils/
      keyboard/         # Swift KeyListener + event definitions
      whisper/          # Transcription (whisper-cli)
      ffmpeg/           # Audio recording + device detection
  mainview/             # React frontend (Vite)
    App.tsx
    components/
      Permissions/
      Ready/
      Settings/
scripts/
  pre-build.ts          # Downloads vendored binaries (whisper, ffmpeg)
  post-build.ts         # Patches .app bundle (plist, icon, binary rename)
  release.sh            # Release pipeline
electrobun.config.ts    # App config, version, build settings
```

## Requirements

- macOS 13+, Apple Silicon
- [Bun](https://bun.sh) v1.3+
- [gh CLI](https://cli.github.com) (for releases)
- Xcode Command Line Tools (for Swift compilation)
