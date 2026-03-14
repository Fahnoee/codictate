import { join } from 'node:path'
import { Tray, BrowserWindow } from 'electrobun/bun'
import { AppConfig } from './AppConfig/AppConfig'
import {
  buildDeviceMenuItems,
  handleDeviceAction,
} from './utils/device-actions'

export type TrayHandlers = {
  setTrayIdle: () => void
  setTrayRecording: () => void
  setTrayTranscribing: () => void
  rebuildDeviceMenu: (selectedDevice: number) => void
}

// Resolves to app/images/MacTrayIcon.png in the bundle.
// import.meta.dir at runtime is the bun/ directory of the bundle.
const trayIconPath = join(import.meta.dir, '../images/MacTrayIcon.svg')

export const setupTray = (
  getOrCreateWindow: () => BrowserWindow,
  devices: Record<string, string>,
  appConfig: AppConfig,
  onQuit: () => void,
  onDeviceSelected?: (device: number) => void
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

  const buildMenu = (selectedDevice: number) => [
    { type: 'normal' as const, label: 'Open Codictate', action: 'open' },
    { type: 'divider' as const },
    {
      type: 'normal' as const,
      label: 'Microphone',
      submenu: buildDeviceMenuItems(devices, selectedDevice),
    },
    { type: 'divider' as const },
    { type: 'normal' as const, label: 'Quit', action: 'quit' },
  ]

  tray.setMenu(buildMenu(appConfig.getAudioDevice()))

  tray.on('tray-clicked', (e) => {
    const event = e as { data: { action: string } }
    if (event.data.action === 'open') {
      getOrCreateWindow().focus()
    }
    if (event.data.action === 'quit') onQuit()
    handleDeviceAction(event.data.action, appConfig, (device) => {
      tray.setMenu(buildMenu(device))
      onDeviceSelected?.(device)
    })
  })

  return {
    setTrayIdle: () => tray.setTitle(''),
    setTrayRecording: () => tray.setTitle(' ⏺'),
    setTrayTranscribing: () => tray.setTitle(' …'),
    rebuildDeviceMenu: (selectedDevice: number) =>
      tray.setMenu(buildMenu(selectedDevice)),
  }
}
