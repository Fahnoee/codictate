#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
swiftc src/bun/utils/keyboard/KeyListener.swift -o src/bun/utils/keyboard/KeyListener
swiftc src/bun/utils/audio/MicRecorder.swift \
  -o src/bun/utils/audio/MicRecorder \
  -framework AVFoundation \
  -framework CoreAudio
