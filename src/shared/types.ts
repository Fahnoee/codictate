/* eslint-disable @typescript-eslint/no-empty-object-type */
import { RPCSchema } from 'electrobun'

export type AppStatus = 'ready' | 'recording' | 'transcribing'
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

export type ShortcutId =
  | 'option-space'
  | 'right-option'
  | 'option-f1'
  | 'option-f2'
  | 'option-enter'

export interface AppSettings {
  shortcutId: ShortcutId
  maxRecordingDuration: number
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
      setSettings: { params: { shortcutId: ShortcutId }; response: boolean }
    }
    messages: {
      logBun: { msg: string }
      openSystemPreferences: { pane: SettingsPane }
      triggerUpdateCheck: {}
      triggerApplyUpdate: {}
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
    }
  }>
}
