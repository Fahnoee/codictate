/* eslint-disable @typescript-eslint/no-empty-object-type */
import { RPCSchema } from 'electrobun'

export type AppStatus = 'ready' | 'recording' | 'transcribing'
export type SettingsPane =
  | 'inputMonitoring'
  | 'microphone'
  | 'accessibility'
  | 'documents'

export interface PermissionState {
  inputMonitoring: boolean
  microphone: boolean
  accessibility: boolean
  documents: boolean
}

export type WebviewRPCType = {
  // Messages/requests handled by the Bun (main) process
  bun: RPCSchema<{
    requests: {
      startMicSession: { params: {}; response: boolean }
      getPermissions: { params: {}; response: PermissionState }
    }
    messages: {
      logBun: { msg: string }
      openSystemPreferences: { pane: SettingsPane }
    }
  }>
  // Messages/requests handled by the browser (webview)
  webview: RPCSchema<{
    requests: {}
    messages: {
      updatePermissions: PermissionState
      updateStatus: { status: AppStatus }
    }
  }>
}
