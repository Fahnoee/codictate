import { join } from 'node:path'
import { Tray, BrowserWindow } from 'electrobun/bun'
import { AppConfig } from './AppConfig/AppConfig'
import {
  buildDeviceMenuItems,
  handleDeviceAction,
} from './utils/device-actions'
import {
  buildTranscriptionLanguageMenuItems,
  handleTranscriptionLanguageAction,
} from './utils/transcription-language-actions'

export type TrayHandlers = {
  setTrayIdle: () => void
  setTrayRecording: () => void
  setTrayTranscribing: () => void
  rebuildDeviceMenu: (selectedDevice: number) => void
  updateDeviceList: (
    newDevices: Record<string, string>,
    selectedDevice: number
  ) => void
  setUpdateChecking: () => void
  showUpdateReady: () => void
  resetUpdateState: () => void
}

// Resolves to app/images/MacTrayIcon.png in the bundle.
// import.meta.dir at runtime is the bun/ directory of the bundle.
const trayIconPath = join(import.meta.dir, '../images/MacTrayIcon.svg')

export const setupTray = (
  getOrCreateWindow: (onAction?: () => void) => BrowserWindow,
  devices: Record<string, string>,
  appConfig: AppConfig,
  onQuit: () => void,
  onDeviceSelected?: (device: number) => void,
  onOpenSettings?: () => void,
  onApplyUpdate?: () => void,
  onCheckForUpdate?: () => void,
  /** After tray changes transcription language — sync webview (e.g. updateSettings). */
  onTranscriptionLanguageChanged?: () => void
): TrayHandlers => {
  const tray = new Tray({
    image: trayIconPath,
    // template: true renders the icon as a macOS template image — it
    // automatically inverts for light/dark mode. Requires a black + transparent
    // PNG. Set to false if the icon uses colours.
    template: true,
    width: 16,
    height: 16,
  })

  let currentDevices = devices

  type UpdateState = 'idle' | 'checking' | 'ready'
  let updateState: UpdateState = 'idle'

  const updateMenuItem = () => {
    if (updateState === 'ready')
      return {
        type: 'normal' as const,
        label: '⬆ Restart to Update',
        action: 'restart-to-update',
      }
    if (updateState === 'checking')
      return {
        type: 'normal' as const,
        label: 'Checking for Updates…',
        action: 'noop',
      }
    return {
      type: 'normal' as const,
      label: 'Check for Updates',
      action: 'check-for-update',
    }
  }

  const buildMenu = (selectedDevice: number) => [
    { type: 'normal' as const, label: 'Open Codictate', action: 'open' },
    { type: 'normal' as const, label: 'Settings', action: 'open-settings' },
    { type: 'divider' as const },
    updateMenuItem(),
    { type: 'divider' as const },
    {
      type: 'normal' as const,
      label: 'Microphone',
      submenu: buildDeviceMenuItems(currentDevices, selectedDevice),
    },
    {
      type: 'normal' as const,
      label: 'Transcription language',
      submenu: buildTranscriptionLanguageMenuItems(
        appConfig.getTranscriptionLanguageId()
      ),
    },
    { type: 'divider' as const },
    {
      type: 'normal' as const,
      label: 'Quit',
      action: 'quit',
    },
  ]

  tray.setMenu(buildMenu(appConfig.resolveAudioDevice(devices)))

  tray.on('tray-clicked', (e) => {
    const event = e as { data: { action: string } }
    if (event.data.action === 'open') {
      getOrCreateWindow().focus()
    }
    if (event.data.action === 'open-settings') {
      onOpenSettings?.()
    }
    if (event.data.action === 'check-for-update') onCheckForUpdate?.()
    if (event.data.action === 'restart-to-update') onApplyUpdate?.()
    if (event.data.action === 'quit') onQuit()
    handleDeviceAction(
      event.data.action,
      appConfig,
      currentDevices,
      (device) => {
        tray.setMenu(buildMenu(device))
        onDeviceSelected?.(device)
      }
    )
    handleTranscriptionLanguageAction(event.data.action, appConfig, () => {
      tray.setMenu(buildMenu(appConfig.resolveAudioDevice(currentDevices)))
      onTranscriptionLanguageChanged?.()
    })
  })

  return {
    setTrayIdle: () => tray.setTitle(''),
    setTrayRecording: () => tray.setTitle(' ⏺'),
    setTrayTranscribing: () => tray.setTitle(' …'),
    rebuildDeviceMenu: (selectedDevice: number) =>
      tray.setMenu(buildMenu(selectedDevice)),
    updateDeviceList: (
      newDevices: Record<string, string>,
      selectedDevice: number
    ) => {
      currentDevices = newDevices
      tray.setMenu(buildMenu(selectedDevice))
    },
    setUpdateChecking: () => {
      updateState = 'checking'
      tray.setMenu(buildMenu(appConfig.resolveAudioDevice(currentDevices)))
    },
    showUpdateReady: () => {
      updateState = 'ready'
      tray.setMenu(buildMenu(appConfig.resolveAudioDevice(currentDevices)))
    },
    resetUpdateState: () => {
      updateState = 'idle'
      tray.setMenu(buildMenu(appConfig.resolveAudioDevice(currentDevices)))
    },
  }
}
