import {
  BrowserWindow,
  BrowserView,
  Screen,
  type Display,
} from 'electrobun/bun'
import type {
  AppSettings,
  AppStatus,
  IndicatorWebviewRPCType,
  RecordingIndicatorMode,
} from '../shared/types'

/** Window frame around the circular HUD (56px circle + padding). */
const INDICATOR_FRAME_PX = 72

/**
 * Electrobun does not expose NSWindow-style hide/orderOut on `BrowserWindow`
 * (see BrowserWindow methods in the package — no `setHidden`). `minimize()` is
 * a poor fit (Dock tile, animations, focus side effects). Shrinking and moving
 * the window off-screen achieves “invisible without closing” without handing
 * key window to the main Codictate window.
 */
const PARKED_INDICATOR_FRAME = {
  x: -10_000,
  y: -10_000,
  width: 1,
  height: 1,
} as const
export type IndicatorWindowHandle = {
  onAppStatus: (status: AppStatus) => void
  onConfigChanged: () => void
  dispose: () => void
}

function indicatorShouldExist(
  mode: RecordingIndicatorMode,
  status: AppStatus
): boolean {
  if (mode === 'off') return false
  if (mode === 'always') return true
  return status === 'recording' || status === 'transcribing'
}

function pickIndicatorDisplay(): Display {
  const displays = Screen.getAllDisplays()
  if (displays.length === 0) return Screen.getPrimaryDisplay()

  const cursor = Screen.getCursorScreenPoint()
  const containingDisplay = displays.find((display) => {
    const { x, y, width, height } = display.bounds
    return (
      cursor.x >= x &&
      cursor.x < x + width &&
      cursor.y >= y &&
      cursor.y < y + height
    )
  })

  if (containingDisplay) return containingDisplay

  return displays.reduce((closest, display) => {
    const closestCenterX = closest.bounds.x + closest.bounds.width / 2
    const closestCenterY = closest.bounds.y + closest.bounds.height / 2
    const displayCenterX = display.bounds.x + display.bounds.width / 2
    const displayCenterY = display.bounds.y + display.bounds.height / 2
    const closestDistance =
      (cursor.x - closestCenterX) ** 2 + (cursor.y - closestCenterY) ** 2
    const displayDistance =
      (cursor.x - displayCenterX) ** 2 + (cursor.y - displayCenterY) ** 2
    return displayDistance < closestDistance ? display : closest
  })
}

function bottomRightFrame(): {
  x: number
  y: number
  width: number
  height: number
} {
  const { workArea } = pickIndicatorDisplay()
  const margin = 16
  const x = Math.round(
    workArea.x + workArea.width - INDICATOR_FRAME_PX - margin
  )
  const y = Math.round(
    workArea.y + workArea.height - INDICATOR_FRAME_PX - margin
  )
  return { x, y, width: INDICATOR_FRAME_PX, height: INDICATOR_FRAME_PX }
}

export function setupIndicatorWindow(deps: {
  url: string
  getSettings: () => AppSettings
}): IndicatorWindowHandle {
  let indicatorWin: BrowserWindow | null = null
  let lastStatus: AppStatus = 'ready'

  const indicatorRpc = BrowserView.defineRPC<IndicatorWebviewRPCType>({
    maxRequestTime: 5000,
    handlers: {
      requests: {},
      messages: {},
    },
  })

  function destroyWindow() {
    if (indicatorWin && BrowserWindow.getById(indicatorWin.id)) {
      try {
        indicatorWin.close()
      } catch {
        /* already closed */
      }
    }
    indicatorWin = null
  }

  /**
   * Follows Electrobun’s documented floating-widget pattern: `transparent: true`,
   * `titleBarStyle: 'hidden'`, plus `styleMask` flags from the BrowserWindow API
   * (UtilityWindow, NonactivatingPanel). See:
   * https://blackboard.sh/electrobun/docs/apis/browser-window
   *
   * Do not call `BrowserWindow.show()` on the HUD — in Electrobun it maps to
   * `focusWindow()` (same as `.focus()` in the public API: brings the window
   * forward and gives it focus). Create with `hidden: false` so the native layer
   * shows the window; use `setFrame` / `setAlwaysOnTop` after load as needed.
   *
   * `passthrough: false`: native mouse passthrough broke WKWebView painting;
   * click-through uses `pointer-events: none` in `indicator.css`.
   */
  function createWindow(
    initialFrame: {
      x: number
      y: number
      width: number
      height: number
    } = bottomRightFrame()
  ): BrowserWindow {
    return new BrowserWindow({
      title: 'Codictate indicator',
      url: deps.url,
      frame: initialFrame,
      titleBarStyle: 'hidden',
      transparent: true,
      passthrough: false,
      hidden: false,
      rpc: indicatorRpc,
      styleMask: {
        Borderless: true,
        Titled: false,
        Closable: false,
        Miniaturizable: false,
        Resizable: false,
        UnifiedTitleAndToolbar: false,
        FullScreen: false,
        FullSizeContentView: true,
        UtilityWindow: true,
        DocModalWindow: false,
        NonactivatingPanel: true,
        HUDWindow: false,
      },
    })
  }

  function pushStatusToWebview(status: AppStatus) {
    try {
      indicatorRpc.send.updateStatus({ status })
    } catch {
      /* RPC bridge not connected yet */
    }
  }

  function placeBottomRight(win: BrowserWindow) {
    const f = bottomRightFrame()
    win.setFrame(f.x, f.y, f.width, f.height)
  }

  function applyVisibleOverlayBehavior(win: BrowserWindow) {
    placeBottomRight(win)
    win.setAlwaysOnTop(true)
    win.setVisibleOnAllWorkspaces(true)
  }

  /**
   * Same as a real “hide” would do: window stays open but user never sees it.
   * (True hide is unavailable on Electrobun’s BrowserWindow today.)
   */
  function parkIndicatorWindow(win: BrowserWindow) {
    try {
      win.setAlwaysOnTop(false)
      win.setFrame(
        PARKED_INDICATOR_FRAME.x,
        PARKED_INDICATOR_FRAME.y,
        PARKED_INDICATOR_FRAME.width,
        PARKED_INDICATOR_FRAME.height
      )
    } catch {
      /* window gone */
    }
  }

  const onAppStatus = (status: AppStatus) => {
    lastStatus = status
    const mode =
      deps.getSettings().recordingIndicatorMode ?? ('when-active' as const)

    if (!indicatorShouldExist(mode, status)) {
      const win =
        indicatorWin !== null && BrowserWindow.getById(indicatorWin.id)
          ? indicatorWin
          : null
      if (win) {
        const parkForReuse = mode === 'when-active' && status === 'ready'
        if (parkForReuse) {
          pushStatusToWebview(status)
          parkIndicatorWindow(win)
        } else {
          destroyWindow()
        }
      } else {
        indicatorWin = null
      }
      return
    }

    const existed =
      indicatorWin !== null && BrowserWindow.getById(indicatorWin.id)
    if (!existed) {
      indicatorWin = createWindow()
      const w = indicatorWin
      applyVisibleOverlayBehavior(w)
      w.webview.on('dom-ready', () => {
        if (!indicatorWin || indicatorWin.id !== w.id) return
        applyVisibleOverlayBehavior(w)
        pushStatusToWebview(lastStatus)
        setTimeout(() => {
          if (!indicatorWin || indicatorWin.id !== w.id) return
          applyVisibleOverlayBehavior(w)
        }, 120)
      })
    }
    const win = indicatorWin!

    pushStatusToWebview(status)
    if (!existed) {
      setTimeout(() => pushStatusToWebview(lastStatus), 450)
    }

    applyVisibleOverlayBehavior(win)
    // Do not call win.show() — it maps to focusWindow() and activates Codictate.
  }

  const onConfigChanged = () => {
    onAppStatus(lastStatus)
  }

  const dispose = () => {
    destroyWindow()
  }

  return { onAppStatus, onConfigChanged, dispose }
}
