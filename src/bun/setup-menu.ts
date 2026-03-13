import Electrobun, { ApplicationMenu } from 'electrobun/bun'
import { AppConfig } from './AppConfig/AppConfig'
import {
  buildDeviceMenuItems,
  handleDeviceAction,
} from './utils/device-actions'

export const setupApplicationMenu = (
  devices: Record<string, string>,
  appConfig: AppConfig
) => {
  ApplicationMenu.setApplicationMenu([
    {
      submenu: [{ label: 'Quit', role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Device',
      submenu: [
        {
          label: 'Microphone',
          submenu: buildDeviceMenuItems(devices),
        },
      ],
    },
  ])

  Electrobun.events.on('application-menu-clicked', (e) => {
    handleDeviceAction(e.data.action, appConfig)
  })
}
