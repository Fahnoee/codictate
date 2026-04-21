/* eslint-disable @typescript-eslint/no-empty-object-type */
import { RPCSchema } from 'electrobun'
import type {
  FormattingModeId,
  FormattingEmailGreetingStyle,
  FormattingEmailClosingStyle,
  FormattingImessageTone,
  FormattingSlackTone,
  FormattingDocumentTone,
  FormattingDocumentStructure,
} from './formatting-modes'

export type {
  FormattingModeId,
  FormattingEmailGreetingStyle,
  FormattingEmailClosingStyle,
  FormattingImessageTone,
  FormattingSlackTone,
  FormattingDocumentTone,
  FormattingDocumentStructure,
}

export interface FocusedAppContext {
  appName: string
  bundleIdentifier: string | null
  windowTitle: string | null
}

export type FormattingEnabledModes = Record<FormattingModeId, boolean>

export interface FormattingRuntimeSettings {
  /** Master switch — when false, runtime never formats. */
  formattingEnabled: boolean
  /** Per-format on/off used by app-aware auto-detect. */
  formattingEnabledModes: FormattingEnabledModes
  /** Tray-level force override; when non-null, bypasses app detection. */
  formattingForceModeId: FormattingModeId | null
  /** Transcription language ID (e.g. 'da', 'zh-cn', 'auto'). Passed to the formatter for locale hints. */
  transcriptionLanguageId: string
  userDisplayName: string
  formattingEmailIncludeSenderName: boolean
  formattingEmailGreetingStyle: FormattingEmailGreetingStyle
  formattingEmailClosingStyle: FormattingEmailClosingStyle
  formattingEmailCustomGreeting: string
  formattingEmailCustomClosing: string
  formattingImessageTone: FormattingImessageTone
  formattingImessageAllowEmoji: boolean
  formattingImessageLightweight: boolean
  formattingSlackTone: FormattingSlackTone
  formattingSlackAllowEmoji: boolean
  formattingSlackUseMarkdown: boolean
  formattingSlackLightweight: boolean
  formattingDocumentTone: FormattingDocumentTone
  formattingDocumentStructure: FormattingDocumentStructure
  /** Skip Apple Intelligence for document apps and only apply lightweight cleanup. */
  formattingDocumentLightweight: boolean
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
  /** Hidden easter-egg toggle that swaps dictation start/stop sounds. */
  funModeEnabled: boolean
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
  /** Master switch for post-processing formatting (FoundationModels, macOS 26+). */
  formattingEnabled: boolean
  /** Per-format opt-in for app-aware auto-detect. */
  formattingEnabledModes: FormattingEnabledModes
  /**
   * Tray-level force override. When non-null, this mode is applied to the next
   * dictations regardless of which app is focused. Stays on until the user
   * picks "Auto" again from the tray. Ignored when `formattingEnabled` is false.
   */
  formattingForceModeId: FormattingModeId | null
  /** When true, email formatting may append the user's stored display name in the sign-off. */
  formattingEmailIncludeSenderName: boolean
  /** Preferred greeting tone for email formatting. */
  formattingEmailGreetingStyle: FormattingEmailGreetingStyle
  /** Preferred closing tone for email formatting. */
  formattingEmailClosingStyle: FormattingEmailClosingStyle
  /** Custom greeting text used when greeting style is 'custom'. */
  formattingEmailCustomGreeting: string
  /** Custom closing text used when closing style is 'custom'. */
  formattingEmailCustomClosing: string
  /** Messages tone. */
  formattingImessageTone: FormattingImessageTone
  /** Allow emoji in Messages output. */
  formattingImessageAllowEmoji: boolean
  /** Skip Apple Intelligence for Messages and only apply lightweight deterministic styling. */
  formattingImessageLightweight: boolean
  /** Slack tone. */
  formattingSlackTone: FormattingSlackTone
  /** Allow emoji in Slack output. */
  formattingSlackAllowEmoji: boolean
  /** Allow Slack-flavoured markdown (*bold*, _italic_, `code`, lists). */
  formattingSlackUseMarkdown: boolean
  /** Skip Apple Intelligence for Slack and only apply lightweight deterministic styling. */
  formattingSlackLightweight: boolean
  /** Document tone. */
  formattingDocumentTone: FormattingDocumentTone
  /** Document structure preference. */
  formattingDocumentStructure: FormattingDocumentStructure
  /** Skip Apple Intelligence for documents and only apply lightweight cleanup. */
  formattingDocumentLightweight: boolean
  /**
   * Duck amount applied to enabled output ducking targets.
   * 0 = fully mute, 100 = no change.
   */
  audioDuckingLevel: number
  /** When true, ducking also applies with headphones/Bluetooth/USB (default: true). */
  audioDuckingIncludeHeadphones: boolean
  /**
   * When true, mute built-in Mac speaker output while dictating (MicRecorder and stream helper).
   * Default true.
   */
  audioDuckingIncludeBuiltInSpeakers: boolean
  /**
   * Read-only: true when FoundationModels is available on this device (macOS 26+ with Apple
   * Intelligence). Not persisted — computed at runtime and included in getSettings() responses.
   */
  formattingAvailable: boolean
  /** User-defined words/phrases the transcription engine should correct to. */
  dictionaryEntries: string[]
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
      setFunModeEnabled: { params: { enabled: boolean }; response: boolean }
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
      setFormattingEnabled: {
        params: { enabled: boolean }
        response: boolean
      }
      setFormattingModeEnabled: {
        params: { modeId: FormattingModeId; enabled: boolean }
        response: boolean
      }
      setFormattingForceModeId: {
        params: { modeId: FormattingModeId | null }
        response: boolean
      }
      setUserDisplayName: {
        params: { userDisplayName: string }
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
      setFormattingEmailCustomGreeting: {
        params: { text: string }
        response: boolean
      }
      setFormattingEmailCustomClosing: {
        params: { text: string }
        response: boolean
      }
      setFormattingImessageTone: {
        params: { tone: FormattingImessageTone }
        response: boolean
      }
      setFormattingImessageAllowEmoji: {
        params: { enabled: boolean }
        response: boolean
      }
      setFormattingImessageLightweight: {
        params: { enabled: boolean }
        response: boolean
      }
      setFormattingSlackTone: {
        params: { tone: FormattingSlackTone }
        response: boolean
      }
      setFormattingSlackAllowEmoji: {
        params: { enabled: boolean }
        response: boolean
      }
      setFormattingSlackUseMarkdown: {
        params: { enabled: boolean }
        response: boolean
      }
      setFormattingSlackLightweight: {
        params: { enabled: boolean }
        response: boolean
      }
      setFormattingDocumentTone: {
        params: { tone: FormattingDocumentTone }
        response: boolean
      }
      setFormattingDocumentStructure: {
        params: { structure: FormattingDocumentStructure }
        response: boolean
      }
      setFormattingDocumentLightweight: {
        params: { enabled: boolean }
        response: boolean
      }
      setAudioDuckingLevel: {
        params: { level: number }
        response: boolean
      }
      setAudioDuckingIncludeHeadphones: {
        params: { enabled: boolean }
        response: boolean
      }
      setAudioDuckingIncludeBuiltInSpeakers: {
        params: { enabled: boolean }
        response: boolean
      }
      addDictionaryEntry: {
        params: { word: string }
        response: boolean
      }
      removeDictionaryEntry: {
        params: { word: string }
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
