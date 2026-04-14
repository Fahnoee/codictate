/* eslint-disable @typescript-eslint/no-empty-object-type */
import { RPCSchema } from 'electrobun'
import type { FormattingModeId } from './formatting-modes'

export type { FormattingModeId }
export type FormattingEmailGreetingStyle = 'auto' | 'hi' | 'hello'
export type FormattingEmailClosingStyle =
  | 'auto'
  | 'best-regards'
  | 'thanks'
  | 'kind-regards'

export interface FocusedAppContext {
  appName: string
  bundleIdentifier: string | null
  windowTitle: string | null
}

export interface FormattingRuntimeSettings {
  formattingModeId: FormattingModeId
  formattingAutoSelectEnabled: boolean
  userDisplayName: string
  formattingEmailIncludeSenderName: boolean
  formattingEmailGreetingStyle: FormattingEmailGreetingStyle
  formattingEmailClosingStyle: FormattingEmailClosingStyle
}

export type AppStatus = 'ready' | 'recording' | 'transcribing' | 'streaming'
export type UpdateCheckState =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'up-to-date'
  | 'ready'
  | 'error'
export type SettingsPane =
  | 'inputMonitoring'
  | 'microphone'
  | 'accessibility'
  | 'documents'

/** Dev-only: force the main window to a root screen (Vite `import.meta.env.DEV`). */
export type DevAppPreviewRoute = 'permissions' | 'onboarding' | 'ready'

/** Floating recording / activity chip on the desktop (separate transparent window). */
export type RecordingIndicatorMode = 'off' | 'always' | 'when-active'
export type StreamTranscriptionMode = 'vad' | 'live'

export type ShortcutId =
  | 'option-space'
  | 'right-option'
  | 'option-enter'
  | 'fn-space'
  | 'fn-f1'
  | 'fn-f2'
  /** Fn / Globe key alone (hardware varies; may not work on all keyboards). */
  | 'fn-globe'
  | 'control-space'
  | 'control-enter'

export interface AppSettings {
  /** Tap-or-hold smart shortcut (500ms gate + second press to stop). */
  shortcutId: ShortcutId
  /** Optional push-to-talk only; release always ends recording. Must differ from `shortcutId`. */
  shortcutHoldOnlyId: ShortcutId | null
  maxRecordingDuration: number
  debugMode: boolean
  /** `auto` = language detection; else a key from `TRANSCRIPTION_LANGUAGE_OPTIONS`. */
  transcriptionLanguageId: string
  /** ID of the Whisper model to use for transcription. Defaults to `large-v3-turbo-q5_0` (bundled). */
  whisperModelId: string
  /** When true, Whisper translates speech to English using the selected Small or Large model (not Turbo). */
  translateToEnglish: boolean
  /**
   * Default source language used only by translate mode when the normal
   * transcription language is auto-detect. Always set: `'auto'` = no fixed
   * default yet (translate-from-auto requires a concrete language); else a key
   * from `TRANSCRIPTION_LANGUAGE_OPTIONS`.
   */
  translateDefaultLanguageId: string
  /** First-run product onboarding after permissions; persisted, false until completed. */
  onboardingCompleted: boolean
  /** Desktop activity indicator: off, always visible, or only while recording/transcribing. */
  recordingIndicatorMode: RecordingIndicatorMode
  /**
   * Last top-left position of the floating indicator window (screen coordinates).
   * `null` = use default placement (bottom-right of primary work area).
   */
  recordingIndicatorPosition: { x: number; y: number } | null
  /**
   * When true, use hands-free stream dictation (Parakeet / Core ML). Requires the Parakeet model
   * download; normal shortcut toggles the stream instead of push-to-talk recording.
   */
  streamMode: boolean
  /** Stream transcription behavior: VAD utterance commits or low-latency live chunks. */
  streamTranscriptionMode: StreamTranscriptionMode
  /** General user profile name, available to formatting and future personalized behaviors. */
  userDisplayName: string
  /** Post-processing format to apply after batch transcription (FoundationModels, macOS 26+). */
  formattingModeId: FormattingModeId
  /** When true, Codictate may override the manual formatting mode based on the focused app. */
  formattingAutoSelectEnabled: boolean
  /** When true, email formatting may append the user's stored display name in the sign-off. */
  formattingEmailIncludeSenderName: boolean
  /** Preferred greeting tone for email formatting. */
  formattingEmailGreetingStyle: FormattingEmailGreetingStyle
  /** Preferred closing tone for email formatting. */
  formattingEmailClosingStyle: FormattingEmailClosingStyle
  /**
   * Read-only: true when FoundationModels is available on this device (macOS 26+ with Apple
   * Intelligence). Not persisted — computed at runtime and included in getSettings() responses.
   */
  formattingAvailable: boolean
}

export interface PermissionState {
  inputMonitoring: boolean
  microphone: boolean
  accessibility: boolean
  documents: boolean
}

export interface DeviceInfo {
  devices: Record<string, string>
  selectedDevice: number
}

export type WebviewRPCType = {
  // Messages/requests handled by the Bun (main) process
  bun: RPCSchema<{
    requests: {
      startMicSession: { params: {}; response: boolean }
      getPermissions: { params: {}; response: PermissionState }
      getDevices: { params: {}; response: DeviceInfo }
      getSettings: { params: {}; response: AppSettings }
      setSettings: {
        params: {
          shortcutId?: ShortcutId
          shortcutHoldOnlyId?: ShortcutId | null
        }
        response: boolean
      }
      setAudioDevice: { params: { index: number }; response: boolean }
      setDebugMode: { params: { enabled: boolean }; response: boolean }
      setTranscriptionLanguage: {
        params: { transcriptionLanguageId: string }
        response: boolean
      }
      setMaxRecordingDuration: {
        params: { maxRecordingDuration: number }
        response: boolean
      }
      setWhisperModel: { params: { modelId: string }; response: boolean }
      setTranslateToEnglish: { params: { enabled: boolean }; response: boolean }
      setTranslateDefaultLanguage: {
        params: { languageId: string }
        response: boolean
      }
      completeOnboarding: { params: {}; response: boolean }
      setRecordingIndicatorMode: {
        params: { mode: RecordingIndicatorMode }
        response: boolean
      }
      setStreamMode: { params: { enabled: boolean }; response: boolean }
      setStreamTranscriptionMode: {
        params: { mode: StreamTranscriptionMode }
        response: boolean
      }
      setFormattingMode: {
        params: { modeId: FormattingModeId }
        response: boolean
      }
      setUserDisplayName: {
        params: { userDisplayName: string }
        response: boolean
      }
      setFormattingAutoSelectEnabled: {
        params: { enabled: boolean }
        response: boolean
      }
      setFormattingEmailIncludeSenderName: {
        params: { enabled: boolean }
        response: boolean
      }
      setFormattingEmailGreetingStyle: {
        params: { style: FormattingEmailGreetingStyle }
        response: boolean
      }
      setFormattingEmailClosingStyle: {
        params: { style: FormattingEmailClosingStyle }
        response: boolean
      }
      /** Ephemeral: show the floating indicator during onboarding to preview the chosen mode. */
      setOnboardingIndicatorPreview: {
        params: { active: boolean; mode?: RecordingIndicatorMode }
        response: boolean
      }
    }
    messages: {
      logBun: { msg: string }
      openSystemPreferences: { pane: SettingsPane }
      triggerPermissionPrompt: { pane: SettingsPane }
      triggerUpdateCheck: {}
      triggerApplyUpdate: {}
      copyDebugLog: {}
      downloadWhisperModel: { modelId: string }
      cancelModelDownload: { modelId: string }
      deleteWhisperModel: { modelId: string }
    }
  }>
  // Messages/requests handled by the browser (webview)
  webview: RPCSchema<{
    requests: {}
    messages: {
      updatePermissions: PermissionState
      updateStatus: { status: AppStatus }
      updateDevice: DeviceInfo
      updateSettings: AppSettings
      openSettingsScreen: {}
      updateCheckStatus: { state: UpdateCheckState; message?: string }
      updateModelDownloadProgress: {
        modelId: string
        progressFraction: number
        done: boolean
        error?: string
      }
      updateModelAvailability: { modelId: string; available: boolean }
    }
  }>
}

/** RPC for the small indicator `BrowserWindow` (bun → webview only). */
export type IndicatorWebviewRPCType = {
  bun: RPCSchema<{
    requests: {}
    messages: {}
  }>
  webview: RPCSchema<{
    requests: {}
    messages: {
      updateStatus: { status: AppStatus }
    }
  }>
}
