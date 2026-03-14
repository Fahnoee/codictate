import { BrowserView, BrowserWindow } from 'electrobun/bun'
import type {
  WebviewRPCType,
  AppSettings,
  AppStatus,
  DeviceInfo,
  PermissionState,
  SettingsPane,
  ShortcutId,
  UpdateCheckState,
} from '../shared/types'
import { AppConfig } from './AppConfig/AppConfig'

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
  devices: Record<string, string>
  getPermissions: () => Promise<PermissionState>
  onSettingsChanged: (shortcutId: ShortcutId) => Promise<void>
  onTriggerUpdateCheck?: () => void
  onApplyUpdate?: () => Promise<void>
  /** Called after a newly re-created window is ready to receive RPC messages. */
  onNewWindowReady?: () => void
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
  }
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
        getDevices: async () => ({
          devices: deps.devices,
          selectedDevice: deps.appConfig.getAudioDevice(),
        }),
        getSettings: async () => deps.appConfig.getSettings(),
        setSettings: async ({ shortcutId }) => {
          await deps.appConfig.setShortcutId(shortcutId)
          await deps.onSettingsChanged(shortcutId)
          return true
        },
      },
      messages: {
        logBun: ({ msg }) => console.log('Bun Log:', msg),
        openSystemPreferences: ({ pane }) => {
          Bun.spawn(['open', SYSTEM_PREFS_URLS[pane]])
        },
        triggerUpdateCheck: () => deps.onTriggerUpdateCheck?.(),
        triggerApplyUpdate: () => deps.onApplyUpdate?.(),
      },
    },
  })

  function createMainWindow() {
    return new BrowserWindow({
      title: 'Codictate',
      url: deps.url,
      frame: { width: 900, height: 700, x: 200, y: 200 },
      titleBarStyle: 'hiddenInset',
      rpc,
    })
  }

  let mainWindow = createMainWindow()

  function getOrCreateWindow(onAction?: () => void): BrowserWindow {
    if (BrowserWindow.getById(mainWindow.id)) {
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
      updateStatus: (data) => rpc.send.updateStatus(data),
      updatePermissions: (data) => rpc.send.updatePermissions(data),
      updateDevice: (data) => rpc.send.updateDevice(data),
      updateSettings: (data) => rpc.send.updateSettings(data),
      openSettingsScreen: () => rpc.send.openSettingsScreen({}),
      updateCheckStatus: (data) => rpc.send.updateCheckStatus(data),
    },
    getOrCreateWindow,
  }
}
