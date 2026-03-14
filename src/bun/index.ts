import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Electrobun, {
  BrowserView,
  BrowserWindow,
  Updater,
  Utils,
} from 'electrobun/bun'
import type {
  WebviewRPCType,
  PermissionState,
  SettingsPane,
} from '../shared/types'
import { findDevices } from './utils/ffmpeg/devices'
import { AppConfig } from './AppConfig/AppConfig'
import { setupApplicationMenu } from './setup-menu'
import { setupTray } from './setup-tray'
import { setupRecording } from './setup-recording'

const DEV_SERVER_PORT = 5173
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`

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

function checkDocumentsPermission(): boolean {
  try {
    readdirSync(join(homedir(), 'Documents'))
    return true
  } catch {
    return false
  }
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
// onDeviceSelected, trayHandlers, and menuHandlers are all wired up below.
// These are forward-referenced here since setupApplicationMenu is called
// before trayHandlers is assigned — closures capture by reference so by
// the time any callback fires, all variables will be initialised.
// eslint-disable-next-line prefer-const
let trayHandlers: ReturnType<typeof setupTray>
// eslint-disable-next-line prefer-const
let menuHandlers: ReturnType<typeof setupApplicationMenu>

const onDeviceSelected = (device: number) => {
  // Keep both menus in sync with the new selection.
  trayHandlers.rebuildDeviceMenu(device)
  menuHandlers.rebuildDeviceMenu(device)
  // Push the change to the webview so the UI updates immediately.
  rpc.send.updateDevice({ devices, selectedDevice: device })
}

menuHandlers = setupApplicationMenu(
  devices,
  UserAppConfig,
  () => getOrCreateWindow(),
  onDeviceSelected
)

let currentPermissions: PermissionState = {
  inputMonitoring: false,
  microphone: false,
  accessibility: false,
  documents: false,
}

function allPermissionsGranted(p: PermissionState): boolean {
  return p.inputMonitoring && p.microphone && p.accessibility && p.documents
}

const rpc = BrowserView.defineRPC<WebviewRPCType>({
  handlers: {
    requests: {
      startMicSession: async () => true,
      getPermissions: async () => {
        // Re-check documents on every request since it can change at any time
        currentPermissions = {
          ...currentPermissions,
          documents: checkDocumentsPermission(),
        }
        // Also trigger a fresh check from the native process for mic + accessibility
        if (keyboard.isAlive) keyboard.checkPermissions()
        return currentPermissions
      },
      getDevices: async () => ({
        devices,
        selectedDevice: UserAppConfig.getAudioDevice(),
      }),
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
    titleBarStyle: 'hiddenInset',
    rpc,
  })
}

let mainWindow = createMainWindow()

function getOrCreateWindow(): BrowserWindow {
  if (BrowserWindow.getById(mainWindow.id)) {
    return mainWindow
  }
  mainWindow = createMainWindow()
  setTimeout(() => {
    rpc.send.updateStatus({ status: 'ready' })
    rpc.send.updatePermissions(currentPermissions)
  }, 500)
  return mainWindow
}

trayHandlers = setupTray(
  getOrCreateWindow,
  devices,
  UserAppConfig,
  () => {
    keyboard.stop()
    setTimeout(() => Utils.quit(), 150)
  },
  onDeviceSelected
)

let permissionPoll: ReturnType<typeof setInterval> | null = null

function startKeyboard() {
  return setupRecording(
    UserAppConfig,
    trayHandlers,
    (status) => {
      rpc.send.updateStatus({ status })
    },
    (nativePermissions) => {
      currentPermissions = {
        ...nativePermissions,
        documents: checkDocumentsPermission(),
      }
      rpc.send.updatePermissions(currentPermissions)

      if (allPermissionsGranted(currentPermissions)) {
        if (permissionPoll) {
          clearInterval(permissionPoll)
          permissionPoll = null
        }
      } else if (!permissionPoll) {
        permissionPoll = setInterval(() => {
          if (keyboard.isAlive) {
            keyboard.checkPermissions()
          } else {
            // KeyListener exited (Input Monitoring denied) — try to restart it.
            // If IM is still denied the new process exits immediately and
            // onPermissions fires again with inputMonitoring: false.
            keyboard = startKeyboard()
          }
        }, 3000)
      }
    }
  )
}

let keyboard = startKeyboard()

setTimeout(() => {
  rpc.send.updateStatus({ status: 'ready' })
  keyboard.checkPermissions()
}, 500)

// Stop the keyboard process cleanly before the app exits, regardless of
// whether quit was triggered via Cmd+Q, the menu item, or the tray.
Electrobun.events.on('before-quit', () => keyboard.stop())
process.on('exit', () => keyboard.stop())

console.log('Codictate started!')
