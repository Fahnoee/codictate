# Recording indicator (desktop HUD)

This document explains how the floating recording indicator works after the fullscreen fix.

## What it is

- A small native macOS `NSPanel` managed by a separate helper executable: `CodictateWindowHelper`
- Driven by app status: `ready` | `recording` | `transcribing`
- Shown according to `recordingIndicatorMode`: `off`, `always`, or `when-active`

## Why it is native now

The previous implementation used a separate Electrobun `BrowserWindow` with a React entrypoint. That worked across normal Spaces, but not reliably over native macOS fullscreen Spaces.

The working fix was to move the HUD to a dedicated AppKit helper process:

- Main app stays in Electrobun/Bun/React
- Indicator rendering and window behavior live in native AppKit
- Bun communicates with the helper over stdin/stdout, similar to the existing native helpers

This avoids two problems we hit during the fullscreen work:

- Electrobun `BrowserWindow` did not provide the right fullscreen-space semantics for this overlay
- Bun FFI crashed when we tried to drive an `NSPanel` directly through a dylib boundary

An important side effect of that change is that the indicator now behaves properly under AeroSpace as well. There is no special AeroSpace app config involved in Codictate itself.

## Current architecture

### Main app side

- `src/bun/setup-indicator-window.ts`
  Decides when the indicator should exist and where it should appear
- `src/bun/utils/window/native-indicator-helper.ts`
  Spawns `CodictateWindowHelper` and sends `show` / `hide` / `status` commands

### Native helper side

- `native/CodictateWindowHelper/Sources/CodictateWindowHelper/main.swift`
  Owns the real `NSPanel`, drawing, animation, and drag/move reporting

### Build and packaging

- `src/scripts/build-swift.sh`
  Builds `CodictateWindowHelper` and vendors it to `vendors/window-helper/CodictateWindowHelper`
- `electrobun.config.ts`
  Copies that executable into `native-helpers/CodictateWindowHelper`
- `scripts/post-build.ts`
  Verifies and codesigns `CodictateWindowHelper` alongside the other native helpers

## Native panel behavior

The helper uses a borderless, nonactivating `NSPanel` with:

- `.canJoinAllSpaces`
- `.fullScreenAuxiliary`
- `.stationary`
- `.ignoresCycle`
- high window level (`.screenSaver`)

Important detail:

- `canJoinAllSpaces` and `moveToActiveSpace` cannot be combined; AppKit throws if both are set

## Animation

The old animation used React + Motion. The current animation is native AppKit drawing:

- `ready`: subtle breathing pulse
- `recording`: red pulse/ring animation
- `transcribing`: animated blue level bars

## Persistence

- The helper reports drag moves back to Bun over stdout as JSON lines
- `setup-indicator-window.ts` debounces and saves the top-left position into app config
- Saved positions are clamped back onto a valid display before reuse

## What is no longer used

These legacy files are gone because the indicator is no longer a webview:

- `src/mainview/indicator.html`
- `src/mainview/indicator/main.tsx`
- `src/mainview/indicator.css`
- `IndicatorWebviewRPCType`
- `scripts/duplicate-dist-assets-for-indicator.ts`

## Checklist when touching this feature

1. If fullscreen behavior regresses, inspect the native helper first, not Electrobun `BrowserWindow`
2. If the indicator stops launching, check that `CodictateWindowHelper` is built into `vendors/window-helper/` and copied into `native-helpers/`
3. If packaged builds fail notarization/signing, check `scripts/post-build.ts` and `entitlements/CodictateWindowHelper.entitlements`
