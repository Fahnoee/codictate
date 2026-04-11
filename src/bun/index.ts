import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Electrobun, { Updater, Utils } from 'electrobun/bun'
import type { PermissionState, SettingsPane } from '../shared/types'
import { findDevices } from './utils/audio/devices'
import { duckDelayAfterStartChimeMs } from './utils/sound/play-sound'
import { checkMicrophoneAuthorization } from './utils/audio/check-mic-authorization'
import { AppConfig } from './AppConfig/AppConfig'
import { setupApplicationMenu } from './setup-menu'
import { setupTray } from './setup-tray'
import { setupRecording } from './setup-recording'
import { setupWindow } from './setup-window'
import {
  setupIndicatorWindow,
  type IndicatorWindowHandle,
} from './setup-indicator-window'
import { setOnAutoDisable } from './utils/logger'
import { modelManager } from './utils/whisper/model-manager'
import { WHISPER_MODELS, getTranslateReadiness } from '../shared/whisper-models'

const DEV_SERVER_PORT = 5173
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`

const INPUT_MONITORING_PREFS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent'

function checkDocumentsPermission(): boolean {
  try {
    readdirSync(join(homedir(), 'Documents'))
    return true
  } catch {
    return false
  }
}

/** Only touch ~/Documents (TCC) once the user has completed the step before it.
 *  Permission order: Accessibility → Documents → Microphone → Input Monitoring.
 *  So we probe as soon as accessibility is granted (or all native perms are done). */
function shouldProbeDocuments(
  p: Pick<PermissionState, 'inputMonitoring' | 'microphone' | 'accessibility'>
): boolean {
  return p.accessibility
}

function mergeDocumentsField(
  nativeSlice: Pick<
    PermissionState,
    'inputMonitoring' | 'microphone' | 'accessibility'
  >,
  previousDocuments: boolean
): boolean {
  if (shouldProbeDocuments(nativeSlice)) return checkDocumentsPermission()
  return previousDocuments
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

async function getIndicatorViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel()
  if (channel === 'dev') {
    try {
      await fetch(DEV_SERVER_URL, { method: 'HEAD' })
      return `${DEV_SERVER_URL}/indicator.html`
    } catch {
      console.log(
        "Vite dev server not running — indicator uses bundled views (run 'bun run dev:hmr' for HMR)."
      )
    }
  }
  return 'views://indicator/index.html'
}

const url = await getMainViewUrl()
const indicatorUrl = await getIndicatorViewUrl()

export const UserAppConfig = new AppConfig()
await UserAppConfig.load()

// Heal disk state if translate was left on without a runnable model/language combo.
if (UserAppConfig.getTranslateToEnglish()) {
  const readiness = getTranslateReadiness(
    UserAppConfig.getWhisperModelId(),
    UserAppConfig.getTranscriptionLanguageId(),
    UserAppConfig.getTranslateDefaultLanguageId(),
    (id) => modelManager.isModelAvailable(id)
  )
  if (readiness.kind !== 'ready') {
    await UserAppConfig.setTranslateOff()
  }
}

let devices = await findDevices()
duckDelayAfterStartChimeMs()

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

const indicatorRef: { current: IndicatorWindowHandle | null } = {
  current: null,
}

const pushInitialState = () => {
  win.send.updateStatus({ status: 'ready' })
  indicatorRef.current?.onAppStatus('ready')
  win.send.updatePermissions(currentPermissions)
  // Push availability for all non-bundled models so the UI knows what's downloaded.
  for (const model of WHISPER_MODELS) {
    if (!model.bundled) {
      win.send.updateModelAvailability({
        modelId: model.id,
        available: modelManager.isModelAvailable(model.id),
      })
    }
  }
  keyboard.checkPermissions()
}

const onApplyUpdate = async () => {
  if (Updater.updateInfo()?.updateReady) {
    await Updater.applyUpdate()
  }
}

/** Main window cannot shrink below this (see `setup-window` resize clamp). */
const MAIN_WINDOW_MIN_SIZE = { width: 800, height: 660 } as const

const win = setupWindow({
  url,
  appConfig: UserAppConfig,
  openWindowOnLaunch: true,
  windowMinSize: MAIN_WINDOW_MIN_SIZE,
  getCurrentDevices: () => devices,
  getPermissions: async () => {
    let microphone = currentPermissions.microphone
    try {
      microphone = await checkMicrophoneAuthorization()
    } catch {
      /* MicRecorder unavailable — leave previous value */
    }
    currentPermissions = {
      ...currentPermissions,
      microphone,
      documents: mergeDocumentsField(
        currentPermissions,
        currentPermissions.documents
      ),
    }
    if (keyboard.isAlive) keyboard.checkPermissions()
    return currentPermissions
  },
  onSettingsChanged: async () => {
    keyboard.stop()
    keyboard = startKeyboard()
    win.send.updateSettings(UserAppConfig.getSettings())
    trayHandlers.refreshTrayShortcutTitle()
  },
  onAudioDeviceSelected: async (index) => {
    const deviceName = devices[index.toString()]
    await UserAppConfig.setAudioDevice(index, deviceName)
    trayHandlers.rebuildDeviceMenu(index)
    menuHandlers.rebuildDeviceMenu(index)
  },
  onSetDebugMode: async (enabled) => {
    await UserAppConfig.setDebugMode(enabled)
    win.send.updateSettings(UserAppConfig.getSettings())
  },
  onTriggerUpdateCheck: () => checkForUpdates(),
  onApplyUpdate: onApplyUpdate,
  // Re-push app state whenever the window is re-opened after being closed.
  onNewWindowReady: () => pushInitialState(),
  onTranscriptionMenuSync: () => {
    trayHandlers.rebuildDeviceMenu(UserAppConfig.resolveAudioDevice(devices))
  },
  onTranslateChanged: () => {
    trayHandlers.syncTranslateState()
  },
  onTriggerPermissionPrompt: (pane: SettingsPane) => {
    if (pane === 'inputMonitoring') {
      if (keyboard.isAlive) {
        keyboard.requestInputMonitoringPrompt()
      }
      Bun.spawn(['open', INPUT_MONITORING_PREFS_URL])
      return
    }
    if (!keyboard.isAlive) return
    switch (pane) {
      case 'accessibility':
        keyboard.promptAccessibility()
        break
      case 'documents':
        if (shouldProbeDocuments(currentPermissions)) {
          currentPermissions = {
            ...currentPermissions,
            documents: checkDocumentsPermission(),
          }
          win.send.updatePermissions(currentPermissions)
        }
        break
      case 'microphone':
        keyboard.requestMicrophone()
        break
    }
  },
  onRecordingIndicatorModeChanged: () => {
    indicatorRef.current?.onConfigChanged()
  },
  onOnboardingCompleted: () => {
    indicatorRef.current?.onConfigChanged()
  },
  onOnboardingIndicatorPreviewChanged: () => {
    indicatorRef.current?.onConfigChanged()
  },
})

indicatorRef.current = setupIndicatorWindow({
  url: indicatorUrl,
  getSettings: () => UserAppConfig.getSettings(),
  getRecordingIndicatorPosition: () =>
    UserAppConfig.getRecordingIndicatorPosition(),
  saveRecordingIndicatorPosition: (x, y) =>
    UserAppConfig.setRecordingIndicatorPosition(x, y),
  getOnboardingIndicatorPreviewMode: () =>
    UserAppConfig.getRecordingIndicatorOnboardingPreviewMode(),
})

// When the 5-minute auto-disable fires, sync the state back to AppConfig and
// push the updated settings so the UI toggle turns itself off.
setOnAutoDisable(async () => {
  await UserAppConfig.setDebugMode(false)
  win.send.updateSettings(UserAppConfig.getSettings())
})

const onDeviceSelected = (device: number) => {
  trayHandlers.rebuildDeviceMenu(device)
  menuHandlers.rebuildDeviceMenu(device)
  win.send.updateDevice({ devices, selectedDevice: device })
}

function startDeviceMonitor() {
  let snapshot = JSON.stringify(devices)
  setInterval(async () => {
    const newDevices = await findDevices()
    const newSnapshot = JSON.stringify(newDevices)
    if (newSnapshot === snapshot) return
    snapshot = newSnapshot
    devices = newDevices
    const selected = UserAppConfig.resolveAudioDevice(newDevices)
    trayHandlers.updateDeviceList(newDevices, selected)
    menuHandlers.updateDeviceList(newDevices, selected)
    win.send.updateDevice({ devices: newDevices, selectedDevice: selected })
  }, 5000)
}

const onOpenSettings = () => {
  win.getOrCreateWindow(() => win.send.openSettingsScreen()).focus()
}

Electrobun.events.on('reopen', () => {
  win.getOrCreateWindow().focus()
})

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
  () => checkForUpdates(),
  () => win.send.updateSettings(UserAppConfig.getSettings()),
  () => win.send.updateSettings(UserAppConfig.getSettings())
)

let permissionPoll: ReturnType<typeof setInterval> | null = null
let lastKeyboardRespawnMs = 0
const KEYBOARD_RESPAWN_MIN_MS = 30_000

// After the user grants Input Monitoring in System Settings, macOS requires the
// KeyListener process to restart before CGPreflightListenEventAccess() returns true.
// We restart it — but only once all other permissions are done and IM is the sole
// remaining step. Restarting earlier would be pointless (IM hasn't been touched yet)
// and could cause confusion during earlier permission steps.
const IM_TCC_REFRESH_GRACE_MS = 8_000
let imRefreshScheduled = false

function startKeyboard() {
  return setupRecording(
    UserAppConfig,
    trayHandlers,
    (status) => {
      win.send.updateStatus({ status })
      indicatorRef.current?.onAppStatus(status)
    },
    (nativePermissions) => {
      currentPermissions = {
        ...nativePermissions,
        documents: mergeDocumentsField(
          nativePermissions,
          currentPermissions.documents
        ),
      }
      win.send.updatePermissions(currentPermissions)

      if (allPermissionsGranted(currentPermissions)) {
        if (permissionPoll) {
          clearInterval(permissionPoll)
          permissionPoll = null
        }
        imRefreshScheduled = false
        return
      }

      // Only poll for permission changes when something is still outstanding.
      if (!permissionPoll) {
        permissionPoll = setInterval(() => {
          if (allPermissionsGranted(currentPermissions)) {
            clearInterval(permissionPoll!)
            permissionPoll = null
            imRefreshScheduled = false
            return
          }

          // Restart KeyListener for IM TCC refresh ONLY when IM is the last step.
          // (Accessibility + Documents + Microphone must all be done first.)
          const imIsLastStep =
            currentPermissions.accessibility &&
            currentPermissions.documents &&
            currentPermissions.microphone &&
            !currentPermissions.inputMonitoring

          if (imIsLastStep && !imRefreshScheduled && keyboard.isAlive) {
            imRefreshScheduled = true
            setTimeout(() => {
              if (
                !allPermissionsGranted(currentPermissions) &&
                !currentPermissions.inputMonitoring &&
                keyboard.isAlive
              ) {
                keyboard.stop()
                keyboard = startKeyboard()
              }
            }, IM_TCC_REFRESH_GRACE_MS)
            return
          }

          if (keyboard.isAlive) {
            keyboard.checkPermissions()
          } else {
            const now = Date.now()
            if (now - lastKeyboardRespawnMs >= KEYBOARD_RESPAWN_MIN_MS) {
              lastKeyboardRespawnMs = now
              keyboard = startKeyboard()
            }
          }
        }, 3000)
      }
    },
    () => devices
  )
}

let keyboard = startKeyboard()

// Push initial app state once the first window's RPC bridge is live.
setTimeout(pushInitialState, 500)

startDeviceMonitor()

Electrobun.events.on('before-quit', () => {
  trayHandlers.setTrayIdle()
  keyboard.stop()
  indicatorRef.current?.dispose()
})
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
    sendStatus({
      state: 'error',
      message: 'Could not reach the update server',
    })
  }
}

// First check 10 s after launch, then every 4 hours.
setTimeout(checkForUpdates, 10_000)
setInterval(checkForUpdates, 4 * 60 * 60 * 1_000)

console.log('Codictate started!')
