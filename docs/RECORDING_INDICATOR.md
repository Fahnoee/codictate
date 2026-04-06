# Recording indicator (desktop HUD)

This document explains how the small **recording indicator** overlay is built, packaged, and wired into the app—so future changes do not accidentally break a fragile stack (Electrobun + WKWebView + Vite + optional tiling WMs).

## What it is

- A separate **BrowserWindow** with a tiny React surface that mirrors **`AppStatus`** (`ready` | `recording` | `transcribing`).
- Shown according to **`recordingIndicatorMode`** in settings: `off`, `always`, or `when-active` (default: only while recording or transcribing).
- Titled **`Codictate indicator`** so window managers can match it by title (see [AEROSPACE.md](./AEROSPACE.md)).

## Why a second window and second Vite entry

The main UI lives in one webview; the HUD is intentionally **isolated**:

- Different **size**, **transparency**, and **window chrome** (borderless, floating, always-on-top).
- Avoids entangling overlay logic with the main layout and keeps the bundle for the small view minimal.

So we added a **second HTML entry** to Vite (`indicator.html` → `indicator/main.tsx`) alongside `index.html`.

## Build and packaging

### 1. Vite multi-page build and `base: "./"`

- **`vite.config.ts`** declares two Rollup inputs: `main` and `indicator`.
- **`base: './'`** makes emitted asset URLs **relative** (`./assets/...`). That matters because the packaged page is loaded as **`views://indicator/index.html`**, not from the site root. Absolute `/assets/...` would resolve incorrectly next to that URL.

### 2. Mirrored asset directory for Electrobun

Vite writes **one** shared `dist/assets/` for all entrypoints. Electrobun’s **`build.copy`** map needs **distinct source paths** per destination folder. We cannot point both `views/mainview/assets` and `views/indicator/assets` at the same `dist/assets` key twice.

**Fix:** **`scripts/duplicate-dist-assets-for-indicator.ts`** copies `dist/assets` → `dist/indicator-bundled-assets/` before `electrobun build`.

**`electrobun.config.ts`** then copies:

- `dist/indicator.html` → `views/indicator/index.html`
- `dist/indicator-bundled-assets` → `views/indicator/assets`

Release **`package.json`** scripts run Vite, then this duplicate step, then Electrobun.

### 3. Strip `crossorigin` from built HTML (production)

Vite adds **`crossorigin`** on `<script type="module">` and related tags. With Electrobun’s **`views://`** handler, **WKWebView** can treat those module loads as failing CORS checks. Symptom: **empty transparent window** (you might still see a window border from another tool), because the JS bundle never runs.

**Fix:** build-only plugin **`stripCrossoriginForElectrobunWebview`** in **`vite.config.ts`** removes `crossorigin` from emitted HTML. Dev server behavior is unchanged in intent; the problem shows up in **packaged** loads.

### 4. `<base href="./" />` in `indicator.html`

Reinforces correct resolution of `./assets/...` relative to `views/indicator/index.html` under the custom scheme.

## Bun / Electrobun host behavior (`setup-indicator-window.ts`)

### URL selection (`index.ts`)

- **Dev channel** and reachable Vite on port **5173** → `http://localhost:5173/indicator.html` (HMR path).
- Otherwise → **`views://indicator/index.html`** (bundled app).

### Window options (Electrobun docs)

Official reference: **[BrowserWindow API](https://blackboard.sh/electrobun/docs/apis/browser-window)**.

We mirror the documented **floating widget** pattern (`transparent: true`, `titleBarStyle: 'hidden'`) and set **`styleMask`** fields the API lists for macOS (`UtilityWindow`, `NonactivatingPanel`, etc.). The docs also describe **`setAlwaysOnTop`** and **`setVisibleOnAllWorkspaces`** for overlays that stay above other windows and span workspaces.

| Choice | Reason |
|--------|--------|
| **`transparent: true` + `titleBarStyle: 'hidden'`** | Same combination the docs use for non-rectangular / floating UIs; CSS keeps the page background transparent (`indicator.css`). |
| **`passthrough: false`** | Native mouse passthrough broke **painting** in WKWebView; **click-through** is done with **`pointer-events: none`** on `body` / `#root` (still consistent with a floating overlay). |
| **No `.show()` / `.focus()` on the HUD** | Public docs: **`focus()`** brings the window forward **and gives it focus**. Electrobun’s implementation ties **`show()`** to that path too — avoid calling either on the indicator so we don’t *extra* focus the HUD. The window is created visible via the constructor (`hidden: false` in typings). |
| **`NonactivatingPanel` + `UtilityWindow`** | Documented `styleMask` options aimed at utility / panel-style windows. |
| **`setAlwaysOnTop` / `setVisibleOnAllWorkspaces`** | Documented methods for floating tools (see BrowserWindow “Methods” section). |
| **Title `Codictate indicator`** | Stable string for AeroSpace / scripting. |

The public BrowserWindow documentation does **not** describe a separate “order on screen without activating the app” API. If creating the window still raises Codictate globally, that is framework / OS behavior to raise with [Electrobun](https://github.com/blackboardsh/electrobun) (issues or Discord), not something we paper over from app code.

### Idle `when-active`: hide without `close()` (off-screen park)

For **`recordingIndicatorMode === 'when-active'`**, when dictation finishes the status becomes **`ready`** and the HUD is no longer needed. **Calling `BrowserWindow.close()` on the HUD** causes macOS to assign **key window** to another window in the same app — almost always the **main Codictate window** — which steals focus from the app you were dictating into.

**Why not “just hide”?** Electrobun’s **[BrowserWindow](https://blackboard.sh/electrobun/docs/apis/browser-window)** API has **`close`**, **`focus` / `show`** (equivalent), **`minimize`**, etc., but **no** `hide` / `orderOut` / `setVisible(false)` for the native window. **`minimize()`** is a bad substitute (Dock, animations, focus quirks). So we **keep the window open** and **park** it: **`1×1` frame far off-screen** and **`setAlwaysOnTop(false)`**, then restore **`placeBottomRight`** on the next recording. That matches what a proper hide would achieve until the framework adds a first-class API.

The window is **closed** when the user sets the indicator to **`off`**, on **dispose**, or when `indicatorShouldExist` is false for reasons other than idle **`when-active` + `ready`**.

### RPC

- **`IndicatorWebviewRPCType`** in **`shared/types.ts`**: Bun → webview messages only (`updateStatus`). Defined symmetrically with **`Electroview.defineRPC`** in the indicator page and **`BrowserView.defineRPC`** on the host.

### Focus and dictation into other apps

Use the **documented** window flags and avoid **`focus()` / `show()`** on the HUD (see table above). Tiling WMs (e.g. AeroSpace) can still react when the app or a window is raised; see [AEROSPACE.md](./AEROSPACE.md).

### Lifecycle

- **`onAppStatus`**: creates/destroys/hides logic driven by mode + status; repositions on the display nearest the cursor so the HUD appears on the screen you are actively using; pushes status to the webview (with retries around RPC readiness).
- **`onConfigChanged`**: re-evaluates when the user changes indicator mode in Settings.
- **`dispose`**: closes the indicator on app quit.

Settings changes flow: **`setup-window`** exposes **`onRecordingIndicatorModeChanged`** → **`index.ts`** calls **`indicatorRef.current?.onConfigChanged()`**.

## Frontend files (quick map)

| Area | Files |
|------|--------|
| Entry HTML | `src/mainview/indicator.html` |
| React root | `src/mainview/indicator/main.tsx` |
| Transparent page chrome | `src/mainview/indicator.css` |
| Meter UI | `components/Common/VoiceActivityCore.tsx` (`variant: "indicator"` for this HUD) |
| Types / RPC | `src/shared/types.ts` (`RecordingIndicatorMode`, `IndicatorWebviewRPCType`) |
| Persistence / Settings UI | `AppConfig`, `SettingsScreen`, webview RPC `setRecordingIndicatorMode` |

## Tiling window managers

If the user assigns **all Codictate windows** to one workspace, the HUD will follow those rules too unless the WM treats it separately. **AeroSpace** users: see **[docs/AEROSPACE.md](./AEROSPACE.md)** (rule order + `check-further-callbacks`).

## Checklist when touching this feature

1. Run **`vite build`** and confirm **`dist/indicator.html`** references `./assets/...` and has **no** `crossorigin` on scripts (production).
2. Run **`bun run scripts/duplicate-dist-assets-for-indicator.ts`** before packaging if you build manually; **`build:stable` / `build:canary` / `start`** already chain it.
3. If the HUD is **blank** in a packaged build, suspect **asset paths** or **module load** under `views://` before changing React code.
4. If **focus** or **workspace jumping** regresses, confirm we still match **[BrowserWindow](https://blackboard.sh/electrobun/docs/apis/browser-window)** guidance (transparent HUD, `styleMask`, no extra `focus()`/`show()` on the indicator) and review WM rules—not AppleScript workarounds.
