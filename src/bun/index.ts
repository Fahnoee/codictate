import { BrowserView, BrowserWindow, Updater } from 'electrobun/bun'
import { WebviewRPCType } from '../shared/types'
import { findDevices } from './utils/ffmpeg/devices'
import { AppConfig } from './AppConfig/AppConfig'
import { setupApplicationMenu } from './setup-menu'
import { setupTray } from './setup-tray'
import { setupRecording } from './setup-recording'

const DEV_SERVER_PORT = 5173
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel()
  if (channel === 'dev') {
    try {
      await fetch(DEV_SERVER_URL, { method: 'HEAD' })
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`)
      return DEV_SERVER_URL
    } catch {
      console.log(
        "Vite dev server not running. Run 'bun run dev:hmr' for HMR support."
      )
    }
  }
  return 'views://mainview/index.html'
}

const url = await getMainViewUrl()

export const UserAppConfig = new AppConfig()
await UserAppConfig.load()

const devices = await findDevices()
setupApplicationMenu(devices, UserAppConfig)

const rpc = BrowserView.defineRPC<WebviewRPCType>({
  handlers: {
    requests: {
      startMicSession: async () => true,
    },
    messages: {
      logBun: ({ msg }) => console.log('Bun Log:', msg),
    },
  },
})

const mainWindow = new BrowserWindow({
  title: 'Codictate',
  url,
  frame: { width: 900, height: 700, x: 200, y: 200 },
  rpc,
})

const trayHandlers = setupTray(mainWindow, devices, UserAppConfig)
const keyboard = setupRecording(UserAppConfig, trayHandlers)

process.on('exit', () => keyboard.stop())

console.log('Codictate started!')
