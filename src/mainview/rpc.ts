import { Electroview } from 'electrobun/view'
import { QueryClient } from '@tanstack/react-query'
import type {
  WebviewRPCType,
  PermissionState,
  DeviceInfo,
  AppSettings,
  SettingsPane,
  ShortcutId,
  UpdateCheckState,
} from '../shared/types'

import type { AppStatus } from '../shared/types'
import { appEvents } from './app-events'

export const queryClient = new QueryClient()

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
    },
  },
})

appEvents.on('openSettings', (pane: SettingsPane) => {
  rpc.send.openSystemPreferences({ pane })
})

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

export async function setTranscriptionLanguage(
  transcriptionLanguageId: string
): Promise<boolean> {
  return rpc.request.setTranscriptionLanguage({ transcriptionLanguageId })
}

export async function setMaxRecordingDuration(
  maxRecordingDuration: number
): Promise<boolean> {
  return rpc.request.setMaxRecordingDuration({ maxRecordingDuration })
}

export function copyDebugLog(): void {
  rpc.send.copyDebugLog({})
}
