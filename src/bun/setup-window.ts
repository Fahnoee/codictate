import { BrowserView, BrowserWindow } from 'electrobun/bun'
import type {
  WebviewRPCType,
  AppSettings,
  AppStatus,
  DeviceInfo,
  FormattingEmailClosingStyle,
  FormattingEmailGreetingStyle,
  FormattingImessageTone,
  FormattingSlackTone,
  FormattingDocumentTone,
  FormattingDocumentStructure,
  FormattingModeId,
  PermissionState,
  SettingsPane,
  StreamTranscriptionMode,
  UpdateCheckState,
} from '../shared/types'
import { AppConfig } from './AppConfig/AppConfig'
import { copyLogToClipboard } from './utils/logger'
import { log } from './utils/logger'
import { modelManager } from './utils/whisper/model-manager'
import {
  isTranslateCapableModelId,
  resolveTranslateModelId,
} from '../shared/whisper-models'

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
  /** Indicator window should resync when the user changes recording indicator mode in Settings. */
  onRecordingIndicatorModeChanged?: () => void
  /** Indicator is hidden until onboarding completes; refresh when that flips to true. */
  onOnboardingCompleted?: () => void
  /** Indicator preview during onboarding (step 3). */
  onOnboardingIndicatorPreviewChanged?: () => void
  /** Refresh tray and webview after stream mode toggled (from tray or webview). */
  onStreamModeChanged?: () => void
  /** Refresh tray after formatting mode changed from webview. */
  onFormattingModeChanged?: () => void
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
        setFunModeEnabled: async ({ enabled }) => {
          const ok = await deps.appConfig.setFunModeEnabled(enabled)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
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
          const normalized = languageId === '' ? 'auto' : languageId
          const ok =
            await deps.appConfig.setTranslateDefaultLanguageId(normalized)
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
              const srcLang = deps.appConfig.getTranslateDefaultLanguageId()
              if (srcLang === 'auto') {
                rpc.send.updateSettings(deps.appConfig.getSettings())
                return false
              }
              const ok = await deps.appConfig.setTranslateOn(srcLang)
              if (!ok) {
                rpc.send.updateSettings(deps.appConfig.getSettings())
                return false
              }
            } else {
              await deps.appConfig.setTranslateToEnglish(true)
            }
          } else {
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
        setStreamMode: async ({ enabled }) => {
          log('config', 'rpc setStreamMode request', { enabled })
          const ok = await deps.appConfig.setStreamMode(enabled)
          log('config', 'rpc setStreamMode applied', {
            ok,
            streamMode: deps.appConfig.getStreamMode(),
          })
          if (ok) {
            rpc.send.updateSettings(deps.appConfig.getSettings())
            deps.onStreamModeChanged?.()
          }
          return ok
        },
        setStreamTranscriptionMode: async ({
          mode,
        }: {
          mode: StreamTranscriptionMode
        }) => {
          log('config', 'rpc setStreamTranscriptionMode request', { mode })
          await deps.appConfig.setStreamTranscriptionMode(mode)
          rpc.send.updateSettings(deps.appConfig.getSettings())
          deps.onStreamModeChanged?.()
          return true
        },
        setFormattingEnabled: async ({ enabled }: { enabled: boolean }) => {
          log('config', 'rpc setFormattingEnabled request', { enabled })
          const ok = await deps.appConfig.setFormattingEnabled(enabled)
          if (ok) {
            rpc.send.updateSettings(deps.appConfig.getSettings())
            deps.onFormattingModeChanged?.()
          }
          return ok
        },
        setFormattingModeEnabled: async ({
          modeId,
          enabled,
        }: {
          modeId: FormattingModeId
          enabled: boolean
        }) => {
          log('config', 'rpc setFormattingModeEnabled request', {
            modeId,
            enabled,
          })
          const ok = await deps.appConfig.setFormattingModeEnabled(
            modeId,
            enabled
          )
          if (ok) {
            rpc.send.updateSettings(deps.appConfig.getSettings())
            deps.onFormattingModeChanged?.()
          }
          return ok
        },
        setFormattingForceModeId: async ({
          modeId,
        }: {
          modeId: FormattingModeId | null
        }) => {
          log('config', 'rpc setFormattingForceModeId request', { modeId })
          const ok = await deps.appConfig.setFormattingForceModeId(modeId)
          if (ok) {
            rpc.send.updateSettings(deps.appConfig.getSettings())
            deps.onFormattingModeChanged?.()
          }
          return ok
        },
        setUserDisplayName: async ({ userDisplayName }) => {
          const ok = await deps.appConfig.setUserDisplayName(userDisplayName)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingEmailIncludeSenderName: async ({ enabled }) => {
          const ok =
            await deps.appConfig.setFormattingEmailIncludeSenderName(enabled)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingEmailGreetingStyle: async ({
          style,
        }: {
          style: FormattingEmailGreetingStyle
        }) => {
          const ok = await deps.appConfig.setFormattingEmailGreetingStyle(style)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingEmailClosingStyle: async ({
          style,
        }: {
          style: FormattingEmailClosingStyle
        }) => {
          const ok = await deps.appConfig.setFormattingEmailClosingStyle(style)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingEmailCustomGreeting: async ({
          text,
        }: {
          text: string
        }) => {
          const ok = await deps.appConfig.setFormattingEmailCustomGreeting(text)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingEmailCustomClosing: async ({ text }: { text: string }) => {
          const ok = await deps.appConfig.setFormattingEmailCustomClosing(text)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingImessageTone: async ({
          tone,
        }: {
          tone: FormattingImessageTone
        }) => {
          const ok = await deps.appConfig.setFormattingImessageTone(tone)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingImessageAllowEmoji: async ({
          enabled,
        }: {
          enabled: boolean
        }) => {
          const ok =
            await deps.appConfig.setFormattingImessageAllowEmoji(enabled)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingImessageLightweight: async ({
          enabled,
        }: {
          enabled: boolean
        }) => {
          const ok =
            await deps.appConfig.setFormattingImessageLightweight(enabled)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingSlackTone: async ({
          tone,
        }: {
          tone: FormattingSlackTone
        }) => {
          const ok = await deps.appConfig.setFormattingSlackTone(tone)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingSlackAllowEmoji: async ({
          enabled,
        }: {
          enabled: boolean
        }) => {
          const ok = await deps.appConfig.setFormattingSlackAllowEmoji(enabled)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingSlackUseMarkdown: async ({
          enabled,
        }: {
          enabled: boolean
        }) => {
          const ok = await deps.appConfig.setFormattingSlackUseMarkdown(enabled)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingSlackLightweight: async ({
          enabled,
        }: {
          enabled: boolean
        }) => {
          const ok = await deps.appConfig.setFormattingSlackLightweight(enabled)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingDocumentTone: async ({
          tone,
        }: {
          tone: FormattingDocumentTone
        }) => {
          const ok = await deps.appConfig.setFormattingDocumentTone(tone)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingDocumentStructure: async ({
          structure,
        }: {
          structure: FormattingDocumentStructure
        }) => {
          const ok =
            await deps.appConfig.setFormattingDocumentStructure(structure)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setFormattingDocumentLightweight: async ({
          enabled,
        }: {
          enabled: boolean
        }) => {
          const ok =
            await deps.appConfig.setFormattingDocumentLightweight(enabled)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setAudioDuckingLevel: async ({ level }: { level: number }) => {
          const ok = await deps.appConfig.setAudioDuckingLevel(level)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setAudioDuckingIncludeHeadphones: async ({
          enabled,
        }: {
          enabled: boolean
        }) => {
          const ok =
            await deps.appConfig.setAudioDuckingIncludeHeadphones(enabled)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
          return ok
        },
        setAudioDuckingIncludeBuiltInSpeakers: async ({
          enabled,
        }: {
          enabled: boolean
        }) => {
          const ok =
            await deps.appConfig.setAudioDuckingIncludeBuiltInSpeakers(enabled)
          if (ok) rpc.send.updateSettings(deps.appConfig.getSettings())
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
