import Electrobun, { ApplicationMenu, BrowserWindow } from 'electrobun/bun'
import { AppConfig } from './AppConfig/AppConfig'
import {
  buildDeviceMenuItems,
  handleDeviceAction,
} from './utils/device-actions'

export const setupApplicationMenu = (
  devices: Record<string, string>,
  appConfig: AppConfig,
  getOrCreateWindow: () => BrowserWindow,
  onDeviceSelected?: (device: number) => void
): { rebuildDeviceMenu: (selectedDevice: number) => void } => {
  const buildFullMenu = (selectedDevice: number) => [
    {
      submenu: [
        { label: 'Show Window', action: 'show-window' },
        { type: 'separator' as const },
        { label: 'Quit Codictate', role: 'quit' as const },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'pasteAndMatchStyle' as const },
        { role: 'delete' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'Device',
      submenu: [
        {
          label: 'Microphone',
          submenu: buildDeviceMenuItems(devices, selectedDevice),
        },
      ],
    },
  ]

  ApplicationMenu.setApplicationMenu(buildFullMenu(appConfig.getAudioDevice()))

  Electrobun.events.on('application-menu-clicked', (e) => {
    if (e.data.action === 'show-window') {
      getOrCreateWindow().focus()
      return
    }
    handleDeviceAction(e.data.action, appConfig, (device) => {
      ApplicationMenu.setApplicationMenu(buildFullMenu(device))
      onDeviceSelected?.(device)
    })
  })

  return {
    rebuildDeviceMenu: (selectedDevice: number) =>
      ApplicationMenu.setApplicationMenu(buildFullMenu(selectedDevice)),
  }
}
