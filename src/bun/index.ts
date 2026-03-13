import { BrowserView, BrowserWindow, Updater } from 'electrobun/bun'
import { WebviewRPCType } from '../shared/types'
import { findDevices } from './utils/ffmpeg/devices'
import { AppConfig } from './AppConfig/AppConfig'
import { setupApplicationMenu } from './setup-menu'
import { setupTray } from './setup-tray'
import { setupRecording } from './setup-recording'

const DEV_SERVER_PORT = 5173
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`

const SYSTEM_PREFS_URLS = {
  inputMonitoring:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
  microphone:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
}

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
      openSystemPreferences: ({ pane }) => {
        Bun.spawn(['open', SYSTEM_PREFS_URLS[pane]])
      },
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

// Small delay before sending initial state so the webview socket is ready
const sendToWebview = (fn: () => void) => setTimeout(fn, 500)

let permissionPoll: ReturnType<typeof setInterval> | null = null

const keyboard = setupRecording(
  UserAppConfig,
  trayHandlers,
  (status) => {
    rpc.send.updateStatus({ status })
  },
  (permissions) => {
    rpc.send.updatePermissions(permissions)

    if (permissions.inputMonitoring && permissions.microphone) {
      // All granted — stop polling
      if (permissionPoll) {
        clearInterval(permissionPoll)
        permissionPoll = null
      }
    } else if (!permissionPoll) {
      // Start polling every 3 s so the UI updates once the user grants access
      permissionPoll = setInterval(() => {
        keyboard.checkPermissions()
      }, 3000)
    }
  }
)

// Send initial status to the webview after it loads
sendToWebview(() => {
  rpc.send.updateStatus({ status: 'ready' })
  keyboard.checkPermissions()
})

process.on('exit', () => keyboard.stop())

console.log('Codictate started!')
