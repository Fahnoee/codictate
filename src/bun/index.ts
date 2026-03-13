import { BrowserView, BrowserWindow, Updater, Utils } from 'electrobun/bun'
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

function createMainWindow() {
  return new BrowserWindow({
    title: 'Codictate',
    url,
    frame: { width: 900, height: 700, x: 200, y: 200 },
    rpc,
  })
}

let mainWindow = createMainWindow()

// Returns the existing window if still alive, otherwise recreates it.
// Electrobun removes windows from its internal registry when they are closed,
// so BrowserWindow.getById returning undefined is the reliable alive-check.
function getOrCreateWindow(): BrowserWindow {
  if (BrowserWindow.getById(mainWindow.id)) {
    return mainWindow
  }
  mainWindow = createMainWindow()
  // Re-send current state to the new window after it loads
  setTimeout(() => {
    rpc.send.updateStatus({ status: 'ready' })
    keyboard.checkPermissions()
  }, 500)
  return mainWindow
}

const trayHandlers = setupTray(
  getOrCreateWindow,
  devices,
  UserAppConfig,
  () => {
    // Stop the keyboard listener BEFORE quitting so the event tap is cleanly
    // disabled. Utils.quit() calls _exit() which does NOT send SIGTERM to child
    // processes, so we must kill the process explicitly first.
    keyboard.stop()
    // Brief delay to let the KeyListener process handle the kill signal and
    // disable its event tap before we tear down the process tree.
    setTimeout(() => Utils.quit(), 150)
  }
)

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
      if (permissionPoll) {
        clearInterval(permissionPoll)
        permissionPoll = null
      }
    } else if (!permissionPoll) {
      permissionPoll = setInterval(() => {
        keyboard.checkPermissions()
      }, 3000)
    }
  }
)

// Send initial state to the webview after it loads
setTimeout(() => {
  rpc.send.updateStatus({ status: 'ready' })
  keyboard.checkPermissions()
}, 500)

// Fallback cleanup — catches any exit path not handled above
process.on('exit', () => keyboard.stop())

console.log('Codictate started!')
