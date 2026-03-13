/* eslint-disable @typescript-eslint/no-empty-object-type */
import { RPCSchema } from 'electrobun'

export type AppStatus = 'ready' | 'recording' | 'transcribing'
export type SettingsPane = 'inputMonitoring' | 'microphone'

export type WebviewRPCType = {
  // Messages/requests handled by the Bun (main) process
  bun: RPCSchema<{
    requests: {
      startMicSession: { params: {}; response: boolean }
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
      updatePermissions: { inputMonitoring: boolean; microphone: boolean }
      updateStatus: { status: AppStatus }
    }
  }>
}
