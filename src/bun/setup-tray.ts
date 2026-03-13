import { Tray, Utils, BrowserWindow } from 'electrobun/bun'
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

export const setupTray = (
  mainWindow: BrowserWindow,
  devices: Record<string, string>,
  appConfig: AppConfig
): TrayHandlers => {
  const tray = new Tray({ title: '●' })

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
    if (event.data.action === 'open') mainWindow.focus()
    if (event.data.action === 'quit') Utils.quit()
    handleDeviceAction(event.data.action, appConfig)
  })

  return {
    setTrayIdle: () => tray.setTitle('●'),
    setTrayRecording: () => tray.setTitle('⏺ Recording...'),
    setTrayTranscribing: () => tray.setTitle('✦ Transcribing...'),
  }
}
