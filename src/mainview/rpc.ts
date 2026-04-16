import { Electroview } from 'electrobun/view'
import { QueryClient } from '@tanstack/react-query'
import type {
  WebviewRPCType,
  PermissionState,
  DeviceInfo,
  AppSettings,
  SettingsPane,
  ShortcutId,
  StreamTranscriptionMode,
  UpdateCheckState,
  RecordingIndicatorMode,
  AppStatus,
  FormattingModeId,
  FormattingEmailGreetingStyle,
  FormattingEmailClosingStyle,
  FormattingImessageTone,
  FormattingSlackTone,
  FormattingDocumentTone,
  FormattingDocumentStructure,
} from '../shared/types'
import { appEvents } from './app-events'
import { SPEECH_MODELS } from '../shared/speech-models'

export const queryClient = new QueryClient()

// Seed model availability — bundled models are always available.
// Non-bundled entries will be updated by updateModelAvailability messages from the backend.
queryClient.setQueryData(
  ['modelAvailability'],
  Object.fromEntries(SPEECH_MODELS.map((m) => [m.id, m.bundled ?? false]))
)

// rpc is not exported — the inferred type references an internal electrobun path
// that TypeScript cannot name in declaration files (TS2742). All external access
// goes through the typed helpers below.
const rpc = Electroview.defineRPC<WebviewRPCType>({
  handlers: {
    messages: {
      updatePermissions: (data: PermissionState) => {
        queryClient.setQueryData(['permissions'], data)
        appEvents.emit('permissions', data)
      },
      updateStatus: ({ status }: { status: AppStatus }) =>
        appEvents.emit('status', status),
      updateDevice: (data: DeviceInfo) => {
        queryClient.setQueryData(['devices'], data)
      },
      updateSettings: (data: AppSettings) => {
        queryClient.setQueryData(['settings'], data)
        appEvents.emit('settings', data)
      },
      openSettingsScreen: () => {
        appEvents.emit('openSettingsScreen')
      },
      updateCheckStatus: (data: {
        state: UpdateCheckState
        message?: string
      }) => {
        appEvents.emit('updateCheckStatus', data)
      },
      updateModelDownloadProgress: (data: {
        modelId: string
        progressFraction: number
        done: boolean
        error?: string
      }) => {
        appEvents.emit('modelDownloadProgress', data)
      },
      updateModelAvailability: (data: {
        modelId: string
        available: boolean
      }) => {
        queryClient.setQueryData(
          ['modelAvailability'],
          (old: Record<string, boolean> | undefined) => ({
            ...old,
            [data.modelId]: data.available,
          })
        )
        appEvents.emit('modelAvailability', data)
      },
    },
  },
})

appEvents.on('openSettings', (pane: SettingsPane) => {
  rpc.send.openSystemPreferences({ pane })
})

export function triggerPermissionPrompt(pane: SettingsPane): void {
  rpc.send.triggerPermissionPrompt({ pane })
}

// Initialize the Electroview bridge here so main.tsx doesn't need to import rpc.
new Electroview({ rpc })

// ─── Typed helpers for consumers ──────────────────────────────────────────────

export async function fetchPermissions(): Promise<PermissionState> {
  return rpc.request.getPermissions({})
}

export async function fetchDevices(): Promise<DeviceInfo> {
  return rpc.request.getDevices({})
}

export async function fetchSettings(): Promise<AppSettings> {
  return rpc.request.getSettings({})
}

export async function setShortcut(shortcutId: ShortcutId): Promise<boolean> {
  return rpc.request.setSettings({ shortcutId })
}

export async function setShortcutHoldOnly(
  shortcutHoldOnlyId: ShortcutId | null
): Promise<boolean> {
  return rpc.request.setSettings({ shortcutHoldOnlyId })
}

export async function setAudioDevice(index: number): Promise<boolean> {
  return rpc.request.setAudioDevice({ index })
}

export function triggerUpdateCheck(): void {
  rpc.send.triggerUpdateCheck({})
}

export function triggerApplyUpdate(): void {
  rpc.send.triggerApplyUpdate({})
}

export async function setDebugMode(enabled: boolean): Promise<boolean> {
  return rpc.request.setDebugMode({ enabled })
}

export async function setFunModeEnabled(enabled: boolean): Promise<boolean> {
  return rpc.request.setFunModeEnabled({ enabled })
}

export async function setTranscriptionLanguage(
  transcriptionLanguageId: string
): Promise<boolean> {
  return rpc.request.setTranscriptionLanguage({ transcriptionLanguageId })
}

export async function completeOnboarding(): Promise<boolean> {
  return rpc.request.completeOnboarding({})
}

export async function setMaxRecordingDuration(
  maxRecordingDuration: number
): Promise<boolean> {
  return rpc.request.setMaxRecordingDuration({ maxRecordingDuration })
}

export async function setRecordingIndicatorMode(
  mode: RecordingIndicatorMode
): Promise<boolean> {
  return rpc.request.setRecordingIndicatorMode({ mode })
}

export async function setOnboardingIndicatorPreview(params: {
  active: boolean
  mode?: RecordingIndicatorMode
}): Promise<boolean> {
  return rpc.request.setOnboardingIndicatorPreview(params)
}

export function copyDebugLog(): void {
  rpc.send.copyDebugLog({})
}

export async function setWhisperModel(modelId: string): Promise<boolean> {
  return rpc.request.setWhisperModel({ modelId })
}

export async function setTranslateToEnglish(
  enabled: boolean
): Promise<boolean> {
  return rpc.request.setTranslateToEnglish({ enabled })
}

export async function setTranslateDefaultLanguage(
  languageId: string
): Promise<boolean> {
  return rpc.request.setTranslateDefaultLanguage({ languageId })
}

export async function setStreamMode(enabled: boolean): Promise<boolean> {
  return rpc.request.setStreamMode({ enabled })
}

export async function setStreamTranscriptionMode(
  mode: StreamTranscriptionMode
): Promise<boolean> {
  return rpc.request.setStreamTranscriptionMode({ mode })
}

export async function setFormattingEnabled(enabled: boolean): Promise<boolean> {
  return rpc.request.setFormattingEnabled({ enabled })
}

export async function setFormattingModeEnabled(
  modeId: FormattingModeId,
  enabled: boolean
): Promise<boolean> {
  return rpc.request.setFormattingModeEnabled({ modeId, enabled })
}

export async function setFormattingForceModeId(
  modeId: FormattingModeId | null
): Promise<boolean> {
  return rpc.request.setFormattingForceModeId({ modeId })
}

export async function setUserDisplayName(
  userDisplayName: string
): Promise<boolean> {
  return rpc.request.setUserDisplayName({ userDisplayName })
}

export async function setFormattingEmailIncludeSenderName(
  enabled: boolean
): Promise<boolean> {
  return rpc.request.setFormattingEmailIncludeSenderName({ enabled })
}

export async function setFormattingEmailGreetingStyle(
  style: FormattingEmailGreetingStyle
): Promise<boolean> {
  return rpc.request.setFormattingEmailGreetingStyle({ style })
}

export async function setFormattingEmailClosingStyle(
  style: FormattingEmailClosingStyle
): Promise<boolean> {
  return rpc.request.setFormattingEmailClosingStyle({ style })
}

export async function setFormattingEmailCustomGreeting(
  text: string
): Promise<boolean> {
  return rpc.request.setFormattingEmailCustomGreeting({ text })
}

export async function setFormattingEmailCustomClosing(
  text: string
): Promise<boolean> {
  return rpc.request.setFormattingEmailCustomClosing({ text })
}

export async function setFormattingImessageTone(
  tone: FormattingImessageTone
): Promise<boolean> {
  return rpc.request.setFormattingImessageTone({ tone })
}

export async function setFormattingImessageAllowEmoji(
  enabled: boolean
): Promise<boolean> {
  return rpc.request.setFormattingImessageAllowEmoji({ enabled })
}

export async function setFormattingImessageLightweight(
  enabled: boolean
): Promise<boolean> {
  return rpc.request.setFormattingImessageLightweight({ enabled })
}

export async function setFormattingSlackTone(
  tone: FormattingSlackTone
): Promise<boolean> {
  return rpc.request.setFormattingSlackTone({ tone })
}

export async function setFormattingSlackAllowEmoji(
  enabled: boolean
): Promise<boolean> {
  return rpc.request.setFormattingSlackAllowEmoji({ enabled })
}

export async function setFormattingSlackUseMarkdown(
  enabled: boolean
): Promise<boolean> {
  return rpc.request.setFormattingSlackUseMarkdown({ enabled })
}

export async function setFormattingSlackLightweight(
  enabled: boolean
): Promise<boolean> {
  return rpc.request.setFormattingSlackLightweight({ enabled })
}

export async function setFormattingDocumentTone(
  tone: FormattingDocumentTone
): Promise<boolean> {
  return rpc.request.setFormattingDocumentTone({ tone })
}

export async function setFormattingDocumentStructure(
  structure: FormattingDocumentStructure
): Promise<boolean> {
  return rpc.request.setFormattingDocumentStructure({ structure })
}

export async function setFormattingDocumentLightweight(
  enabled: boolean
): Promise<boolean> {
  return rpc.request.setFormattingDocumentLightweight({ enabled })
}

export async function setAudioDuckingLevel(level: number): Promise<boolean> {
  return rpc.request.setAudioDuckingLevel({ level })
}

export async function setAudioDuckingIncludeHeadphones(
  enabled: boolean
): Promise<boolean> {
  return rpc.request.setAudioDuckingIncludeHeadphones({ enabled })
}

export async function setAudioDuckingIncludeBuiltInSpeakers(
  enabled: boolean
): Promise<boolean> {
  return rpc.request.setAudioDuckingIncludeBuiltInSpeakers({ enabled })
}

export function downloadWhisperModel(modelId: string): void {
  rpc.send.downloadWhisperModel({ modelId })
}

export function cancelModelDownload(modelId: string): void {
  rpc.send.cancelModelDownload({ modelId })
}

export function deleteWhisperModel(modelId: string): void {
  rpc.send.deleteWhisperModel({ modelId })
}
