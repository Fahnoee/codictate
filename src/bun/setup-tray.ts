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
}

// Resolves to app/images/MacTrayIcon.png in the bundle.
// import.meta.dir at runtime is the bun/ directory of the bundle.
const trayIconPath = join(import.meta.dir, '../images/MacTrayIcon.svg')

export const setupTray = (
  getOrCreateWindow: () => BrowserWindow,
  devices: Record<string, string>,
  appConfig: AppConfig,
  onQuit: () => void
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

  tray.setMenu([
    { type: 'normal', label: 'Open Codictate', action: 'open' },
    { type: 'divider' },
    {
      type: 'normal',
      label: 'Microphone',
      submenu: buildDeviceMenuItems(devices),
    },
    { type: 'divider' },
    { type: 'normal', label: 'Quit', action: 'quit' },
  ])

  tray.on('tray-clicked', (e) => {
    const event = e as { data: { action: string } }
    if (event.data.action === 'open') {
      getOrCreateWindow().focus()
    }
    if (event.data.action === 'quit') onQuit()
    handleDeviceAction(event.data.action, appConfig)
  })

  return {
    // Idle: icon only, no extra text
    setTrayIdle: () => tray.setTitle(''),
    // Recording: brief indicator next to the icon
    setTrayRecording: () => tray.setTitle(' ⏺'),
    // Transcribing: brief indicator next to the icon
    setTrayTranscribing: () => tray.setTitle(' …'),
  }
}
