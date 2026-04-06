import {
  startRecording,
  stopRecording,
  type RecordingSession,
} from './utils/audio/start-rec'
import {
  Key,
  SHORTCUTS,
  startKeyboardListener,
  type KeyEvent,
  type PermissionStatus,
  type StartKeyboardListenerOptions,
} from './utils/keyboard/keyboard-events'
import { playStartSound } from './utils/sound/play-sound'
import { AppConfig } from './AppConfig/AppConfig'
import type { TrayHandlers } from './setup-tray'
import { DICTATION_HOLD_QUALIFY_MS } from '../shared/dictation-shortcut'
import type { AppStatus } from '../shared/types'

export const setupRecording = (
  appConfig: AppConfig,
  { setTrayIdle, setTrayRecording, setTrayTranscribing }: TrayHandlers,
  onStatusChange?: (status: AppStatus) => void,
  onPermissions?: (status: PermissionStatus) => void,
  keyboardOptions?: StartKeyboardListenerOptions
) => {
  let recorderProc: ReturnType<typeof Bun.spawn> | null = null
  let recordingSession: RecordingSession | null = null
  let sessionStarting = false
  let sessionStopping = false
  let transcriptionPipelineActive = false
  let pendingHoldReleaseWhileStarting = false

  let holdArmTimer: ReturnType<typeof setTimeout> | null = null
  /** True after HOLD_QUALIFY_MS with no qualifying release cancelling the arm timer. */
  let holdQualified = false

  const getShortcut = () => SHORTCUTS[appConfig.getShortcutId()]

  const clearHoldArmTimer = () => {
    if (holdArmTimer !== null) {
      clearTimeout(holdArmTimer)
      holdArmTimer = null
    }
  }

  const resetHoldGate = () => {
    clearHoldArmTimer()
    holdQualified = false
  }

  const armHoldGateAfterStart = () => {
    resetHoldGate()
    holdArmTimer = setTimeout(() => {
      holdArmTimer = null
      if (recorderProc !== null) holdQualified = true
    }, DICTATION_HOLD_QUALIFY_MS)
  }

  const tryStop = async () => {
    if (!recorderProc || sessionStopping) return
    sessionStopping = true
    resetHoldGate()
    try {
      console.log('END RECORD')
      const proc = recorderProc
      await stopRecording(proc)
      recorderProc = null
    } finally {
      sessionStopping = false
    }
  }

  const tryStart = async () => {
    if (
      recorderProc !== null ||
      sessionStarting ||
      transcriptionPipelineActive
    ) {
      return
    }
    sessionStarting = true
    pendingHoldReleaseWhileStarting = false
    try {
      console.log('START RECORD')
      playStartSound()
      setTrayRecording()
      onStatusChange?.('recording')
      recordingSession = { discard: false }
      recorderProc = await startRecording(
        appConfig,
        () => {
          recorderProc = null
          transcriptionPipelineActive = true
          setTrayTranscribing()
          onStatusChange?.('transcribing')
        },
        () => {
          transcriptionPipelineActive = false
          recordingSession = null
          setTrayIdle()
          onStatusChange?.('ready')
        },
        recordingSession
      )

      if (pendingHoldReleaseWhileStarting && recordingSession && recorderProc) {
        resetHoldGate()
        recordingSession.discard = true
        const p = recorderProc
        recorderProc = null
        setTrayIdle()
        onStatusChange?.('ready')
        p.kill('SIGINT')
        await p.exited
      } else if (recorderProc) {
        armHoldGateAfterStart()
      }
    } finally {
      sessionStarting = false
    }
  }

  const handleKeyEvent = async (keyEvent: KeyEvent) => {
    const shortcut = getShortcut()

    if (keyEvent.keycode === Key.escape && keyEvent.keyDown && recorderProc) {
      resetHoldGate()
      if (recordingSession) recordingSession.discard = true
      recorderProc.kill()
      recorderProc = null
      setTrayIdle()
      onStatusChange?.('ready')
      console.log('Recording cancelled')
      return
    }

    if (recorderProc !== null) {
      if (shortcut.matchesHoldUp(keyEvent)) {
        if (sessionStarting) pendingHoldReleaseWhileStarting = true
        if (holdArmTimer !== null) clearHoldArmTimer()
        if (holdQualified) await tryStop()
        return
      }
      if (shortcut.matchesToggleDown(keyEvent) && !keyEvent.isRepeat) {
        resetHoldGate()
        await tryStop()
      }
      return
    }

    if (
      shortcut.matchesToggleDown(keyEvent) &&
      !keyEvent.isRepeat &&
      !transcriptionPipelineActive &&
      !sessionStarting
    ) {
      await tryStart()
    }
  }

  const keyboard = startKeyboardListener(
    (keyEvent) => {
      void handleKeyEvent(keyEvent)
    },
    getShortcut().swallowRules,
    onPermissions,
    keyboardOptions
  )

  return keyboard
}
