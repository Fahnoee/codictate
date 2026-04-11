/* eslint-disable @typescript-eslint/no-empty-object-type */
import { RPCSchema } from 'electrobun'

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
  | 'option-f1'
  | 'option-f2'
  | 'option-enter'
  | 'fn-space'
  | 'fn-f1'
  | 'fn-f2'
  | 'fn-enter'
  /** Fn / Globe key alone (hardware varies; may not work on all keyboards). */
  | 'fn-globe'
  | 'control-space'
  | 'control-f1'
  | 'control-f2'
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
