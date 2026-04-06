<div align="center">
  <img src="logo.png" width="120" alt="Codictate" />

  # Codictate

  **Local-first dictation for macOS: hit your shortcut, speak, and Codictate drops the text where your cursor is—on your machine, not in the cloud.**
</div>

Codictate puts your words wherever your cursor is with a local-first dictation workflow built for macOS. No copy-pasting, no account, no cloud processing of your voice.

## Support

Codictate is free. If it saves you time or money compared to other tools, consider supporting the project.

I'm saving toward an **Apple Developer Program** membership so the app can be **signed and notarized**. That means fewer Gatekeeper warnings and, for most people, no Terminal `xattr` step after install.

[☕ ko-fi.com/emillykke](https://ko-fi.com/emillykke)

## Features

- Fully local transcription with Whisper
- Global shortcut workflow for dictation into any app
- No account, no login, no analytics
- Optimized for Apple Silicon Macs

## Download

Go to [**Releases**](https://github.com/EmilLykke/codictate/releases) and download the latest `.dmg`.

| Channel | Description |
|---------|-------------|
| **Stable** | Recommended for most users |
| **Canary** | Latest changes, updated more frequently |

## Installation

First time installing? See the **[step-by-step installation guide](docs/INSTALL.md)** with screenshots for every step.

Using **[AeroSpace](https://github.com/nikitabobko/AeroSpace)**? See **[docs/AEROSPACE.md](docs/AEROSPACE.md)** for a small `on-window-detected` snippet so the recording HUD stays floating and does not steal focus/workspace behavior from your main Codictate rules.

The short version:

1. Download the `.dmg` from [Releases](https://github.com/EmilLykke/codictate/releases)
2. Drag **Codictate** to your Applications folder
3. Run `xattr -cr /Applications/Codictate.app` in Terminal if macOS blocks it
4. Grant the required permissions when prompted

## Requirements

- macOS 13 or later
- Apple Silicon (M1 or later)
- No internet connection required after install

## Privacy

- No account, no login
- No data collection
- No analytics
- Everything runs locally on your device

## Usage examples

- Draft emails, Slack messages, and documents without leaving the keyboard
- Dictate commit messages, issue comments, and notes while coding
- Capture ideas into any text field with the same shortcut workflow

## Development

```bash
bun install

# Dev (no HMR)
bun run dev

# Dev with HMR
bun run dev:hmr
```

**Recording indicator (second window, Vite entry, Electrobun packaging):** see **[docs/RECORDING_INDICATOR.md](docs/RECORDING_INDICATOR.md)** for architecture and the “why” behind each step.

### Dev requirements

- [Bun](https://bun.sh) v1.3+
- [gh CLI](https://cli.github.com) for releases
- [cmake](https://cmake.org) for building `whisper-cli`
- Xcode Command Line Tools for Swift compilation

## Building

```bash
bun run build:canary
bun run build:stable
bun run build:all
```

Unsigned local builds do not require a `.env` file.

If you want to sign or notarize your own builds, copy `.env.example` to `.env` and fill in the Apple developer credentials:

```bash
cp .env.example .env
```

## Releasing

```bash
bun run release:canary
bun run release:stable
bun run release
```

Optional release notes:

```bash
bun run release -- -m "Your changelog here"
bun run release:stable -- -m "Your changelog here"
bun run release:canary -- -m "Your changelog here"
```

Each release:

1. Builds the selected channel
2. Creates and pushes the matching git tag
3. Creates a versioned GitHub release in this repository
4. Uploads artifacts from `artifacts/`
5. Keeps updater assets available from the latest stable release

After releasing, commit the version bump:

```bash
git add electrobun.config.ts version.json && git commit -m "release: vX.X.X"
```

## Documentation and community

- [Contributing guide](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Project structure

```text
src/
  bun/                  # Main process (Bun/Electrobun)
  mainview/             # React frontend (Vite)
scripts/
  pre-build.ts          # Vendored binary/model setup
  post-build.ts         # App bundle patching
  release.sh            # Release pipeline
docs/
  INSTALL.md            # User install guide
  StepByStep/           # Install guide images
```
