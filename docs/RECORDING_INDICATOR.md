# Recording indicator

A floating status HUD that shows the current dictation state: `ready`, `recording`, or `transcribing`. Implemented natively on both macOS and Windows.

## Architecture

The indicator is a native AppKit `NSPanel` managed by `CodictateWindowHelper` — a separate Swift helper process. The main Bun process sends `show` / `hide` / `status` commands over stdin/stdout.

Key files:

| File | Role |
|------|------|
| `native/CodictateWindowHelper/Sources/.../main.swift` | NSPanel, drawing, animation, drag |
| `src/bun/utils/window/native-indicator-helper.ts` | Spawns helper, sends commands |
| `src/bun/setup-indicator-window.ts` | Decides when/where to show the indicator |

## Why native AppKit

An earlier implementation used an Electrobun `BrowserWindow`. It worked in normal Spaces but failed in native macOS fullscreen Spaces. Moving to a native `NSPanel` fixed both fullscreen Spaces and AeroSpace. Bun FFI was also ruled out — it crashed when driving an `NSPanel` directly across the dylib boundary.

## Panel behaviour

The NSPanel uses `.canJoinAllSpaces`, `.fullScreenAuxiliary`, `.stationary`, `.ignoresCycle`, and a high window level (`.screenSaver`). Note: `canJoinAllSpaces` and `moveToActiveSpace` cannot both be set — AppKit throws.

## Animation

Drawn natively in AppKit:

- `ready` — subtle breathing pulse
- `recording` — red ring animation
- `transcribing` — animated blue level bars

## Position persistence

The helper reports drag moves back to Bun as JSON lines on stdout. `setup-indicator-window.ts` debounces and saves the top-left position to app config. Positions are clamped to a valid display on restore.

## Windows implementation

On Windows the indicator is part of `CodictateWindowsHelper` (Rust) — the same binary that handles keyboard hook and audio recording. It runs as a separate mode (`indicator`) spawned by Bun, receiving commands over stdin/stdout exactly like the macOS helper.

The window is a Win32 layered window (`WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED`) with black as the colorkey for transparency. Animation and drawing are done with GDI — the same states and visual style as macOS (breathing pulse, red ring, orange bars). Drag moves are reported back to Bun as JSON lines on stdout.

Build: `bun run build:native:windows-helper` (Cargo).

## Checklist

- Indicator won't launch on macOS: verify `vendors/window-helper/CodictateWindowHelper` exists (`bun run build:native`)
- Indicator won't launch on Windows: verify `CodictateWindowsHelper.exe` is built (`bun run build:native:windows-helper`)
- macOS notarization fails: check `scripts/post-build.ts` and `entitlements/CodictateWindowHelper.entitlements`
