import { BrowserWindow, BrowserView, Screen } from 'electrobun/bun'
import type {
  AppSettings,
  AppStatus,
  IndicatorWebviewRPCType,
  RecordingIndicatorMode,
} from '../shared/types'

/** Window frame around the circular HUD (56px circle + padding). */
const INDICATOR_FRAME_PX = 72

/**
 * Keep the HUD alive but invisible so closing it does not hand key-window
 * status back to the main Codictate window.
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

/** Keep a BrowserWindow (webview warm) whenever the user wants an indicator at all. */
function indicatorLifecycleActive(
  mode: RecordingIndicatorMode,
  onboardingCompleted: boolean
): boolean {
  if (!onboardingCompleted) return false
  return mode !== 'off'
}

/** Actually visible on screen (not parked off-screen). */
function indicatorShouldBeVisible(
  mode: RecordingIndicatorMode,
  status: AppStatus
): boolean {
  if (mode === 'off') return false
  if (mode === 'always') return true
  return status === 'recording' || status === 'transcribing'
}

function bottomRightFrame(): {
  x: number
  y: number
  width: number
  height: number
} {
  const { workArea } = Screen.getPrimaryDisplay()
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
  getRecordingIndicatorPosition: () => AppSettings['recordingIndicatorPosition']
  saveRecordingIndicatorPosition: (x: number, y: number) => void | Promise<void>
}): IndicatorWindowHandle {
  let indicatorWin: BrowserWindow | null = null
  let lastStatus: AppStatus = 'ready'
  let positionSaveTimer: ReturnType<typeof setTimeout> | null = null
  let suppressIndicatorPositionSave = false

  const indicatorRpc = BrowserView.defineRPC<IndicatorWebviewRPCType>({
    maxRequestTime: 5000,
    handlers: {
      requests: {},
      messages: {},
    },
  })

  function clearPositionSaveTimer() {
    if (positionSaveTimer) {
      clearTimeout(positionSaveTimer)
      positionSaveTimer = null
    }
  }

  function destroyWindow() {
    clearPositionSaveTimer()
    if (indicatorWin && BrowserWindow.getById(indicatorWin.id)) {
      try {
        indicatorWin.close()
      } catch {
        /* already closed */
      }
    }
    indicatorWin = null
  }

  function intersectsAnyDisplay(
    x: number,
    y: number,
    w: number,
    h: number
  ): boolean {
    const displays = Screen.getAllDisplays()
    if (displays.length === 0) return true
    for (const d of displays) {
      const b = d.bounds
      if (
        x + w > b.x &&
        x < b.x + b.width &&
        y + h > b.y &&
        y < b.y + b.height
      ) {
        return true
      }
    }
    return false
  }

  function resolveInitialIndicatorFrame(): {
    x: number
    y: number
    width: number
    height: number
  } {
    const saved = deps.getRecordingIndicatorPosition()
    if (saved === null) return bottomRightFrame()
    const { x, y } = saved
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !intersectsAnyDisplay(x, y, INDICATOR_FRAME_PX, INDICATOR_FRAME_PX)
    ) {
      return bottomRightFrame()
    }
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: INDICATOR_FRAME_PX,
      height: INDICATOR_FRAME_PX,
    }
  }

  function scheduleSaveIndicatorPosition(x: number, y: number) {
    clearPositionSaveTimer()
    positionSaveTimer = setTimeout(() => {
      positionSaveTimer = null
      void deps.saveRecordingIndicatorPosition(x, y)
    }, 450)
  }

  function attachIndicatorPositionPersistence(win: BrowserWindow) {
    win.on('move', (event: unknown) => {
      if (suppressIndicatorPositionSave) return
      if (!indicatorWin || indicatorWin.id !== win.id) return
      const payload = (event as { data?: { x?: number; y?: number } }).data
      if (payload === undefined) return
      const x = payload.x
      const y = payload.y
      if (typeof x !== 'number' || typeof y !== 'number') return
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      let frame: { width: number; height: number }
      try {
        frame = win.getFrame()
      } catch {
        return
      }
      // Parked / minimized artifact — do not persist
      if (frame.width < 32 || frame.height < 32) return
      scheduleSaveIndicatorPosition(x, y)
    })
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
    } = resolveInitialIndicatorFrame()
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

  function applyVisibleOverlayBehavior(win: BrowserWindow) {
    try {
      const f = win.getFrame()
      if (f.width <= 2 && f.height <= 2) {
        const target = resolveInitialIndicatorFrame()
        win.setFrame(target.x, target.y, target.width, target.height)
      }
    } catch {
      /* window gone */
    }
    win.setAlwaysOnTop(true)
    win.setVisibleOnAllWorkspaces(true)
  }

  function parkIndicatorWindow(win: BrowserWindow) {
    suppressIndicatorPositionSave = true
    clearPositionSaveTimer()
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
    setTimeout(() => {
      suppressIndicatorPositionSave = false
    }, 200)
  }

  const onAppStatus = (status: AppStatus) => {
    lastStatus = status
    const settings = deps.getSettings()
    const onboardingCompleted = settings.onboardingCompleted
    const mode = settings.recordingIndicatorMode ?? ('always' as const)

    const wantLifecycle = indicatorLifecycleActive(mode, onboardingCompleted)
    const wantVisible = wantLifecycle && indicatorShouldBeVisible(mode, status)

    if (!wantLifecycle) {
      const win =
        indicatorWin !== null && BrowserWindow.getById(indicatorWin.id)
          ? indicatorWin
          : null
      if (win) {
        destroyWindow()
      } else {
        indicatorWin = null
      }
      return
    }

    const existed =
      indicatorWin !== null && BrowserWindow.getById(indicatorWin.id)
    if (!existed) {
      const initialFrame = wantVisible
        ? resolveInitialIndicatorFrame()
        : {
            x: PARKED_INDICATOR_FRAME.x,
            y: PARKED_INDICATOR_FRAME.y,
            width: PARKED_INDICATOR_FRAME.width,
            height: PARKED_INDICATOR_FRAME.height,
          }
      indicatorWin = createWindow(initialFrame)
      const w = indicatorWin
      attachIndicatorPositionPersistence(w)
      w.webview.on('dom-ready', () => {
        if (!indicatorWin || indicatorWin.id !== w.id) return
        const s = deps.getSettings()
        const oc = s.onboardingCompleted
        const m = s.recordingIndicatorMode ?? ('always' as const)
        const vis =
          indicatorLifecycleActive(m, oc) &&
          indicatorShouldBeVisible(m, lastStatus)
        if (vis) {
          applyVisibleOverlayBehavior(w)
        } else {
          parkIndicatorWindow(w)
        }
        pushStatusToWebview(lastStatus)
        setTimeout(() => {
          if (!indicatorWin || indicatorWin.id !== w.id) return
          const s2 = deps.getSettings()
          const oc2 = s2.onboardingCompleted
          const m2 = s2.recordingIndicatorMode ?? ('always' as const)
          const vis2 =
            indicatorLifecycleActive(m2, oc2) &&
            indicatorShouldBeVisible(m2, lastStatus)
          if (vis2) {
            applyVisibleOverlayBehavior(w)
          } else {
            parkIndicatorWindow(w)
          }
        }, 120)
      })
    }
    const win = indicatorWin!

    pushStatusToWebview(status)
    if (!existed) {
      setTimeout(() => pushStatusToWebview(lastStatus), 450)
    }

    if (wantVisible) {
      applyVisibleOverlayBehavior(win)
    } else {
      parkIndicatorWindow(win)
    }
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
