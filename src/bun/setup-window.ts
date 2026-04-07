import { BrowserView, BrowserWindow } from 'electrobun/bun'
import type {
  WebviewRPCType,
  AppSettings,
  AppStatus,
  DeviceInfo,
  PermissionState,
  SettingsPane,
  UpdateCheckState,
} from '../shared/types'
import { AppConfig } from './AppConfig/AppConfig'
import { copyLogToClipboard } from './utils/logger'
import { modelManager } from './utils/whisper/model-manager'
import {
  isTranslateCapableModelId,
  resolveTranslateModelId,
} from '../shared/whisper-models'

export type MainWindowMinSize = { width: number; height: number }

/** Wait this long after the last resize before clamping (avoids fighting each drag frame). */
const MAIN_WINDOW_MIN_SIZE_DEBOUNCE_MS = 48

type ResizeEventPayload = {
  id: number
  x: number
  y: number
  width: number
  height: number
}

function getResizeEventData(event: unknown): ResizeEventPayload | undefined {
  const data = (event as { data?: ResizeEventPayload }).data
  return data
}

/**
 * Electrobun does not expose NSWindow minSize. Clamping synchronously on every
 * `resize` event fights the user's drag. We debounce so the window only snaps
 * to the minimum after resizing pauses; valid sizes clear any pending clamp.
 */
function attachMainWindowMinimumSize(
  win: BrowserWindow,
  min: MainWindowMinSize
) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const clearDebounce = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  const applyClamp = () => {
    debounceTimer = null
    if (!BrowserWindow.getById(win.id)) return
    if (win.isFullScreen()) return
    const frame = win.getFrame()
    const w = Math.round(frame.width)
    const h = Math.round(frame.height)
    const nw = Math.max(w, min.width)
    const nh = Math.max(h, min.height)
    if (nw !== w || nh !== h) {
      win.setFrame(frame.x, frame.y, nw, nh)
    }
  }

  win.on('resize', (event: unknown) => {
    const data = getResizeEventData(event)
    if (!data || data.id !== win.id) return
    if (win.isFullScreen()) {
      clearDebounce()
      return
    }

    const w = Math.round(data.width)
    const h = Math.round(data.height)
    if (w >= min.width && h >= min.height) {
      clearDebounce()
      return
    }

    clearDebounce()
    debounceTimer = setTimeout(applyClamp, MAIN_WINDOW_MIN_SIZE_DEBOUNCE_MS)
  })
}

const SYSTEM_PREFS_URLS: Record<SettingsPane, string> = {
  inputMonitoring:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
  microphone:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  accessibility:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  documents:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders',
}

interface WindowDeps {
  url: string
  appConfig: AppConfig
  openWindowOnLaunch?: boolean
  /** Returns the live device list — called on every request so it's always fresh. */
  getCurrentDevices: () => Record<string, string>
  getPermissions: () => Promise<PermissionState>
  onSettingsChanged: () => Promise<void>
  /** Called when the user selects a device from the settings screen. Should persist the choice and update menus. */
  onAudioDeviceSelected?: (index: number) => Promise<void>
  onTriggerUpdateCheck?: () => void
  onApplyUpdate?: () => Promise<void>
  /** Called after a newly re-created window is ready to receive RPC messages. */
  onNewWindowReady?: () => void
  onSetDebugMode?: (enabled: boolean) => Promise<void>
  /** Refresh tray/menu checkmarks after language changes from the webview. */
  onTranscriptionMenuSync?: () => void
  /** Refresh tray checkmark after translate mode changes from the webview. */
  onTranslateChanged?: () => void
  /** Show one native permission prompt for the given privacy pane (sequential onboarding). */
  onTriggerPermissionPrompt?: (pane: SettingsPane) => void
  /** If set, the main window cannot be resized smaller than this (enforced on resize). */
  windowMinSize?: MainWindowMinSize
  /** Indicator window should resync when the user changes recording indicator mode in Settings. */
  onRecordingIndicatorModeChanged?: () => void
  /** Indicator is hidden until onboarding completes; refresh when that flips to true. */
  onOnboardingCompleted?: () => void
  /** Indicator preview during onboarding (step 3). */
  onOnboardingIndicatorPreviewChanged?: () => void
}

export interface WindowHandle {
  send: {
    updateStatus: (data: { status: AppStatus }) => void
    updatePermissions: (data: PermissionState) => void
    updateDevice: (data: DeviceInfo) => void
    updateSettings: (data: AppSettings) => void
    openSettingsScreen: () => void
    updateCheckStatus: (data: {
      state: UpdateCheckState
      message?: string
    }) => void
    updateModelDownloadProgress: (data: {
      modelId: string
      progressFraction: number
      done: boolean
      error?: string
    }) => void
    updateModelAvailability: (data: {
      modelId: string
      available: boolean
    }) => void
  }
  hasWindow: () => boolean
  /**
   * Returns (or creates) the main window.
   * `onAction` is invoked once the window is ready to receive messages —
   * immediately if the window already exists, or after a short delay if it
   * was just created (webview needs time to connect the RPC bridge).
   */
  getOrCreateWindow: (onAction?: () => void) => BrowserWindow
}

export function setupWindow(deps: WindowDeps): WindowHandle {
  const rpc = BrowserView.defineRPC<WebviewRPCType>({
    handlers: {
      requests: {
        startMicSession: async () => true,
        getPermissions: deps.getPermissions,
        getDevices: async () => {
          const current = deps.getCurrentDevices()
          return {
            devices: current,
            selectedDevice: deps.appConfig.resolveAudioDevice(current),
          }
        },
        getSettings: async () => deps.appConfig.getSettings(),
        setSettings: async ({ shortcutId, shortcutHoldOnlyId }) => {
          if (shortcutId === undefined && shortcutHoldOnlyId === undefined) {
            return false
          }
          if (shortcutId !== undefined) {
            const ok = await deps.appConfig.setShortcutId(shortcutId)
            if (!ok) return false
          }
          if (shortcutHoldOnlyId !== undefined) {
            const ok =
              await deps.appConfig.setShortcutHoldOnlyId(shortcutHoldOnlyId)
            if (!ok) return false
          }
          await deps.onSettingsChanged()
          return true
        },
        setAudioDevice: async ({ index }) => {
          await deps.onAudioDeviceSelected?.(index)
          const current = deps.getCurrentDevices()
          rpc.send.updateDevice({
            devices: current,
            selectedDevice: deps.appConfig.resolveAudioDevice(current),
          })

          return true
        },
        setDebugMode: async ({ enabled }) => {
          await deps.onSetDebugMode?.(enabled)
          return true
        },
        setTranscriptionLanguage: async ({ transcriptionLanguageId }) => {
          const ok = await deps.appConfig.setTranscriptionLanguageId(
            transcriptionLanguageId
          )
          if (ok) {
            rpc.send.updateSettings(deps.appConfig.getSettings())
            deps.onTranscriptionMenuSync?.()
          }
          return ok
        },
        setMaxRecordingDuration: async ({ maxRecordingDuration }) => {
          const ok =
            await deps.appConfig.setMaxRecordingDurationSeconds(
              maxRecordingDuration
            )
          if (ok) {
            rpc.send.updateSettings(deps.appConfig.getSettings())
          }
          return ok
        },
        setWhisperModel: async ({ modelId }) => {
          const ok = await deps.appConfig.setWhisperModelId(modelId)
          if (ok) {
            rpc.send.updateSettings(deps.appConfig.getSettings())
            deps.onTranslateChanged?.()
          }
          return ok
        },
        setTranslateDefaultLanguage: async ({ languageId }) => {
          const ok =
            await deps.appConfig.setTranslateDefaultLanguageId(languageId)
          if (ok) {
            rpc.send.updateSettings(deps.appConfig.getSettings())
            deps.onTranslateChanged?.()
          }
          return ok
        },
        setTranslateToEnglish: async ({ enabled }) => {
          if (enabled) {
            // Small or Large only (selected + on disk); Turbo cannot translate.
            const selected = deps.appConfig.getWhisperModelId()
            if (
              resolveTranslateModelId(selected, (id) =>
                modelManager.isModelAvailable(id)
              ) === null
            ) {
              rpc.send.updateSettings(deps.appConfig.getSettings())
              return false
            }
            if (deps.appConfig.getTranscriptionLanguageId() === 'auto') {
              const fallback = deps.appConfig.getTranslateDefaultLanguageId()
              if (!fallback) {
                rpc.send.updateSettings(deps.appConfig.getSettings())
                return false
              }
              const ok =
                await deps.appConfig.setTranscriptionLanguageId(fallback)
              if (!ok) {
                rpc.send.updateSettings(deps.appConfig.getSettings())
                return false
              }
            }
            await deps.appConfig.setTranslateToEnglish(true)
          } else {
            // Atomic: sets translateToEnglish=false and transcriptionLanguageId='auto'
            // in a single save — no window where disk can have stale lang state.
            await deps.appConfig.setTranslateOff()
          }
          rpc.send.updateSettings(deps.appConfig.getSettings())
          deps.onTranslateChanged?.()
          return true
        },
        completeOnboarding: async () => {
          await deps.appConfig.setOnboardingCompleted(true)
          rpc.send.updateSettings(deps.appConfig.getSettings())
          deps.onOnboardingCompleted?.()
          return true
        },
        setRecordingIndicatorMode: async ({ mode }) => {
          const ok = await deps.appConfig.setRecordingIndicatorMode(mode)
          if (ok) {
            rpc.send.updateSettings(deps.appConfig.getSettings())
            deps.onRecordingIndicatorModeChanged?.()
          }
          return ok
        },
        setOnboardingIndicatorPreview: async ({ active, mode }) => {
          deps.appConfig.setRecordingIndicatorOnboardingPreview(active, mode)
          deps.onOnboardingIndicatorPreviewChanged?.()
          return true
        },
      },
      messages: {
        logBun: ({ msg }) => console.log('Bun Log:', msg),
        openSystemPreferences: ({ pane }) => {
          Bun.spawn(['open', SYSTEM_PREFS_URLS[pane]])
        },
        triggerPermissionPrompt: ({ pane }) => {
          deps.onTriggerPermissionPrompt?.(pane)
        },
        triggerUpdateCheck: () => deps.onTriggerUpdateCheck?.(),
        triggerApplyUpdate: () => deps.onApplyUpdate?.(),
        copyDebugLog: () => {
          copyLogToClipboard().catch(console.error)
        },
        downloadWhisperModel: ({ modelId }) => {
          modelManager
            .downloadModel(modelId, (progressFraction, done, error) => {
              try {
                rpc.send.updateModelDownloadProgress({
                  modelId,
                  progressFraction,
                  done,
                  error,
                })
                if (done && !error) {
                  rpc.send.updateModelAvailability({ modelId, available: true })
                  if (isTranslateCapableModelId(modelId)) {
                    deps.onTranslateChanged?.()
                  }
                }
              } catch {
                // Window may be closed during a long download
              }
            })
            .catch(console.error)
        },
        cancelModelDownload: ({ modelId }) => {
          modelManager.cancelDownload(modelId)
        },
        deleteWhisperModel: ({ modelId }) => {
          const deleted = modelManager.deleteModel(modelId)
          if (deleted) {
            rpc.send.updateModelAvailability({ modelId, available: false })
            if (isTranslateCapableModelId(modelId)) {
              deps.onTranslateChanged?.()
            }
          }
        },
      },
    },
  })

  function createMainWindow() {
    const win = new BrowserWindow({
      title: 'Codictate',
      url: deps.url,
      frame: { width: 900, height: 700, x: 200, y: 200 },
      titleBarStyle: 'hiddenInset',
      rpc,
    })
    if (deps.windowMinSize) {
      attachMainWindowMinimumSize(win, deps.windowMinSize)
    }
    return win
  }

  let mainWindow: BrowserWindow | null = deps.openWindowOnLaunch
    ? createMainWindow()
    : null

  function hasWindow(): boolean {
    return mainWindow !== null && Boolean(BrowserWindow.getById(mainWindow.id))
  }

  function sendIfWindowAlive<T>(send: () => T): T | undefined {
    if (!hasWindow()) return undefined
    try {
      return send()
    } catch {
      return undefined
    }
  }

  function getOrCreateWindow(onAction?: () => void): BrowserWindow {
    if (mainWindow !== null && BrowserWindow.getById(mainWindow.id)) {
      // Window already exists and its RPC bridge is live.
      onAction?.()
      return mainWindow
    }
    // Window was closed — create a fresh one. The webview takes ~500ms to
    // load and connect the RPC bridge, so we delay both the initial-state
    // push and any caller-specific action until it's ready.
    mainWindow = createMainWindow()
    setTimeout(() => {
      deps.onNewWindowReady?.()
      onAction?.()
    }, 600)
    return mainWindow
  }

  return {
    send: {
      updateStatus: (data) =>
        sendIfWindowAlive(() => rpc.send.updateStatus(data)),
      updatePermissions: (data) =>
        sendIfWindowAlive(() => rpc.send.updatePermissions(data)),
      updateDevice: (data) =>
        sendIfWindowAlive(() => rpc.send.updateDevice(data)),
      updateSettings: (data) =>
        sendIfWindowAlive(() => rpc.send.updateSettings(data)),
      openSettingsScreen: () =>
        sendIfWindowAlive(() => rpc.send.openSettingsScreen({})),
      updateCheckStatus: (data) =>
        sendIfWindowAlive(() => rpc.send.updateCheckStatus(data)),
      updateModelDownloadProgress: (data) =>
        sendIfWindowAlive(() => rpc.send.updateModelDownloadProgress(data)),
      updateModelAvailability: (data) =>
        sendIfWindowAlive(() => rpc.send.updateModelAvailability(data)),
    },
    hasWindow,
    getOrCreateWindow,
  }
}
