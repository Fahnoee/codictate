import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Electrobun, { Updater, Utils } from 'electrobun/bun'
import type { PermissionState } from '../shared/types'
import { findDevices } from './utils/ffmpeg/devices'
import { AppConfig } from './AppConfig/AppConfig'
import { setupApplicationMenu } from './setup-menu'
import { setupTray } from './setup-tray'
import { setupRecording } from './setup-recording'
import { setupWindow } from './setup-window'

const DEV_SERVER_PORT = 5173
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`

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

let currentPermissions: PermissionState = {
  inputMonitoring: false,
  microphone: false,
  accessibility: false,
  documents: false,
}

function allPermissionsGranted(p: PermissionState): boolean {
  return p.inputMonitoring && p.microphone && p.accessibility && p.documents
}

// Forward-declared — closures capture by reference, so they'll be
// initialised by the time any callback actually fires.
// eslint-disable-next-line prefer-const
let trayHandlers: ReturnType<typeof setupTray>
// eslint-disable-next-line prefer-const
let menuHandlers: ReturnType<typeof setupApplicationMenu>

const pushInitialState = () => {
  win.send.updateStatus({ status: 'ready' })
  win.send.updatePermissions(currentPermissions)
  keyboard.checkPermissions()
}

const onApplyUpdate = async () => {
  if (Updater.updateInfo()?.updateReady) {
    await Updater.applyUpdate()
  }
}

const win = setupWindow({
  url,
  appConfig: UserAppConfig,
  devices,
  getPermissions: async () => {
    currentPermissions = {
      ...currentPermissions,
      documents: checkDocumentsPermission(),
    }
    if (keyboard.isAlive) keyboard.checkPermissions()
    return currentPermissions
  },
  onSettingsChanged: async () => {
    keyboard.stop()
    keyboard = startKeyboard()
    win.send.updateSettings(UserAppConfig.getSettings())
  },
  onTriggerUpdateCheck: () => checkForUpdates(),
  onApplyUpdate: onApplyUpdate,
  // Re-push app state whenever the window is re-opened after being closed.
  onNewWindowReady: () => pushInitialState(),
})

const onDeviceSelected = (device: number) => {
  trayHandlers.rebuildDeviceMenu(device)
  menuHandlers.rebuildDeviceMenu(device)
  win.send.updateDevice({ devices, selectedDevice: device })
}

const onOpenSettings = () => {
  win.getOrCreateWindow(() => win.send.openSettingsScreen()).focus()
}

menuHandlers = setupApplicationMenu(
  devices,
  UserAppConfig,
  () => win.getOrCreateWindow(),
  onDeviceSelected,
  onOpenSettings
)

trayHandlers = setupTray(
  (onAction) => win.getOrCreateWindow(onAction),
  devices,
  UserAppConfig,
  () => {
    keyboard.stop()
    setTimeout(() => Utils.quit(), 150)
  },
  onDeviceSelected,
  onOpenSettings,
  onApplyUpdate,
  () => checkForUpdates()
)

let permissionPoll: ReturnType<typeof setInterval> | null = null

function startKeyboard() {
  return setupRecording(
    UserAppConfig,
    trayHandlers,
    (status) => {
      win.send.updateStatus({ status })
    },
    (nativePermissions) => {
      currentPermissions = {
        ...nativePermissions,
        documents: checkDocumentsPermission(),
      }
      win.send.updatePermissions(currentPermissions)

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
            keyboard = startKeyboard()
          }
        }, 3000)
      }
    }
  )
}

let keyboard = startKeyboard()

// Push initial app state once the first window's RPC bridge is live.
setTimeout(pushInitialState, 500)

Electrobun.events.on('before-quit', () => keyboard.stop())
process.on('exit', () => keyboard.stop())

async function checkForUpdates() {
  const sendStatus = (
    state: Parameters<typeof win.send.updateCheckStatus>[0]
  ) => {
    try {
      win.send.updateCheckStatus(state)
    } catch {
      /* window may be closed */
    }
  }

  try {
    const channel = await Updater.localInfo.channel()
    if (channel === 'dev') {
      sendStatus({ state: 'up-to-date', message: 'Running in dev mode' })
      return
    }

    trayHandlers.setUpdateChecking()
    sendStatus({ state: 'checking' })

    const updateInfo = await Updater.checkForUpdate()
    if (!updateInfo.updateAvailable) {
      trayHandlers.resetUpdateState()
      sendStatus({ state: 'up-to-date' })
      return
    }

    sendStatus({ state: 'downloading' })
    await Updater.downloadUpdate()

    if (Updater.updateInfo()?.updateReady) {
      trayHandlers.showUpdateReady()
      sendStatus({ state: 'ready' })
    } else {
      trayHandlers.resetUpdateState()
      sendStatus({ state: 'idle' })
    }
  } catch (e) {
    console.error('Update check failed:', e)
    trayHandlers.resetUpdateState()
    sendStatus({ state: 'error', message: 'Could not reach the update server' })
  }
}

// First check 10 s after launch, then every 4 hours.
setTimeout(checkForUpdates, 10_000)
setInterval(checkForUpdates, 4 * 60 * 60 * 1_000)

console.log('Codictate started!')
