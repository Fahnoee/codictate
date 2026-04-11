# Contributing

Thanks for contributing to Codictate.

## Before you start

- Open an issue for substantial changes before investing time in implementation.
- Keep pull requests focused. Small, reviewable changes land faster.
- Follow the existing code style and project structure.

## Development setup

```bash
bun install
bun run dev:hmr (or simply bun run start)
```

Requirements:

- macOS on Apple Silicon
- Bun v1.3+
- Xcode Command Line Tools
- `cmake` for vendoring `whisper-cli`
- Xcode (Swift toolchain) for vendoring `CodictateParakeetHelper` (Parakeet / Core ML stream + one-shot path)
- [Rust / cargo](https://rustup.rs) for NeMo inverse text normalization ([FluidInference/text-processing-rs](https://github.com/FluidInference/text-processing-rs)), linked into the Parakeet helper

```bash
brew install cmake sdl2
```

> **Note:** Stream mode uses the Parakeet Core ML model (user download, ~2.5 GB) plus the `CodictateParakeetHelper` binary built in `scripts/pre-build.ts` (FluidAudio + NeMo ITN from text-processing-rs). Whisper models still use vendored `whisper-cli`.

If you need signing or notarization for local release testing, copy `.env.example` to `.env` and fill in your Apple developer credentials.

## Pull requests

- Describe the user-facing change and how you tested it.
- Update docs when behavior, installation, or release flow changes.
- Avoid mixing refactors with unrelated fixes.

## License for contributions

By submitting a contribution, you agree that your work will be licensed under the Apache License 2.0.
