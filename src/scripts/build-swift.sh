#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
swiftc src/bun/utils/keyboard/KeyListener.swift -o src/bun/utils/keyboard/KeyListener
swiftc src/bun/utils/audio/MicRecorder.swift \
  -o src/bun/utils/audio/MicRecorder \
  -framework AVFoundation \
  -framework CoreAudio

# Keep the vendored Parakeet helper fresh during normal dev/start flows.
# `electrobun` copies from `vendors/parakeet/CodictateParakeetHelper`, so relying
# only on `scripts/pre-build.ts` leaves a stale helper in the app bundle.
PARAKEET_PKG="native/CodictateParakeetHelper"
PARAKEET_VENDOR_DIR="vendors/parakeet"
PARAKEET_VENDOR_BIN="$PARAKEET_VENDOR_DIR/CodictateParakeetHelper"

mkdir -p "$PARAKEET_VENDOR_DIR"
NEMO_LIB="$PARAKEET_PKG/Vendor/lib/libtext_processing_rs.a"
if [[ ! -f "$NEMO_LIB" ]]; then
  echo "NeMo ITN static library missing; running pre-build (Parakeet + text-processing-rs only)…"
  bun scripts/pre-build.ts --parakeet-only
fi
swift build -c release --package-path "$PARAKEET_PKG"
PARAKEET_BIN_DIR="$(swift build -c release --show-bin-path --package-path "$PARAKEET_PKG")"
cp "$PARAKEET_BIN_DIR/CodictateParakeetHelper" "$PARAKEET_VENDOR_BIN"
chmod +x "$PARAKEET_VENDOR_BIN"
