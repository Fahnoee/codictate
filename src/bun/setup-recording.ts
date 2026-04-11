import {
  startRecording,
  stopRecording,
  type RecordingSession,
} from './utils/audio/start-rec'
import {
  FN_PHYSICAL_KEYCODES,
  Key,
  SHORTCUTS,
  startKeyboardListener,
  type KeyEvent,
  type PermissionStatus,
} from './utils/keyboard/keyboard-events'
import { playStartSound } from './utils/sound/play-sound'
import { AppConfig } from './AppConfig/AppConfig'
import type { TrayHandlers } from './setup-tray'
import {
  DICTATION_HOLD_QUALIFY_MS,
  RIGHT_OPTION_PTT_DEFER_MS,
} from '../shared/dictation-shortcut'
import type { AppStatus, ShortcutId } from '../shared/types'
import { checkMicrophoneAuthorization } from './utils/audio/check-mic-authorization'

/** Keycodes that should not cancel "wait for Fn chord" when main is fn-globe + hold is fn-* (non-globe). */
const FN_GLOBE_DEFER_CANCEL_SUPPRESS = new Set<number>([
  Key.shift,
  Key.rightShift,
  Key.command,
  Key.rightCommand,
  Key.option,
  Key.rightOption,
  Key.control,
  Key.rightControl,
  ...FN_PHYSICAL_KEYCODES,
])

function holdFnChordConflictsWithFnGlobeMain(
  hybridId: ShortcutId,
  holdId: ShortcutId | null
): holdId is ShortcutId {
  return (
    hybridId === 'fn-globe' &&
    holdId !== null &&
    holdId.startsWith('fn-') &&
    holdId !== 'fn-globe'
  )
}

/** Main shortcuts that use ⌥ + a trigger key (same modifier Right ⌥ can supply). */
const OPTION_CHORD_MAIN_IDS = new Set<ShortcutId>([
  'option-space',
  'option-f1',
  'option-f2',
  'option-enter',
])

function needsRightOptionPttChordDefer(
  hybridId: ShortcutId,
  holdId: ShortcutId | null
): boolean {
  return holdId === 'right-option' && OPTION_CHORD_MAIN_IDS.has(hybridId)
}

function mergeSwallowRules(a: KeyEvent[], b: KeyEvent[]): KeyEvent[] {
  const seen = new Set<string>()
  const out: KeyEvent[] = []
  for (const r of [...a, ...b]) {
    const k = `${r.keycode}|${r.option}|${r.command}|${r.control}|${r.shift}|${r.fn}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

export const setupRecording = (
  appConfig: AppConfig,
  { setTrayIdle, setTrayRecording, setTrayTranscribing }: TrayHandlers,
  onStatusChange?: (status: AppStatus) => void,
  onPermissions?: (status: PermissionStatus) => void,
  getAudioDevices?: () => Record<string, string>
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
  /** Which shortcut started the current session (when recorder is active). */
  let activeRecordingMode: 'hybrid' | 'holdOnly' | null = null
  /**
   * Fn-down was swallowed so Fn+key push-to-talk can win over main `fn-globe` (which would
   * otherwise start hybrid on Fn press and drop the chord while `sessionStarting` is true).
   */
  let pendingFnGlobeHybridDefer = false

  let rightOptionPttDeferTimer: ReturnType<typeof setTimeout> | null = null
  let rightOptionPhysicallyDown = false

  const clearRightOptionPttDeferTimer = () => {
    if (rightOptionPttDeferTimer !== null) {
      clearTimeout(rightOptionPttDeferTimer)
      rightOptionPttDeferTimer = null
    }
  }

  const getHybridShortcut = () => SHORTCUTS[appConfig.getShortcutId()]

  const getHoldOnlyShortcut = () => {
    const id = appConfig.getShortcutHoldOnlyId()
    return id !== null ? SHORTCUTS[id] : null
  }

  const getMergedSwallowRules = (): KeyEvent[] => {
    const hybrid = getHybridShortcut()
    const hold = getHoldOnlyShortcut()
    if (hold === null) return hybrid.swallowRules
    return mergeSwallowRules(hybrid.swallowRules, hold.swallowRules)
  }

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
    clearRightOptionPttDeferTimer()
    resetHoldGate()
    try {
      console.log('END RECORD')
      const proc = recorderProc
      await stopRecording(proc)
      recorderProc = null
    } finally {
      sessionStopping = false
      activeRecordingMode = null
    }
  }

  const tryStart = async (mode: 'hybrid' | 'holdOnly') => {
    if (
      recorderProc !== null ||
      sessionStarting ||
      transcriptionPipelineActive
    ) {
      return
    }
    sessionStarting = true
    pendingHoldReleaseWhileStarting = false
    activeRecordingMode = mode
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
          activeRecordingMode = null
          setTrayTranscribing()
          onStatusChange?.('transcribing')
        },
        () => {
          transcriptionPipelineActive = false
          recordingSession = null
          setTrayIdle()
          onStatusChange?.('ready')
        },
        recordingSession,
        getAudioDevices
      )

      if (pendingHoldReleaseWhileStarting && recordingSession && recorderProc) {
        resetHoldGate()
        activeRecordingMode = null
        recordingSession.discard = true
        const p = recorderProc
        recorderProc = null
        setTrayIdle()
        onStatusChange?.('ready')
        p.kill('SIGINT')
        await p.exited
      } else if (recorderProc) {
        if (mode === 'hybrid') armHoldGateAfterStart()
        else resetHoldGate()
      }
    } finally {
      sessionStarting = false
      if (recorderProc === null) activeRecordingMode = null
    }
  }

  const handleKeyEvent = async (keyEvent: KeyEvent) => {
    const hybrid = getHybridShortcut()
    const holdOnly = getHoldOnlyShortcut()

    if (keyEvent.keycode === Key.escape && keyEvent.keyDown && recorderProc) {
      resetHoldGate()
      activeRecordingMode = null
      if (recordingSession) recordingSession.discard = true
      recorderProc.kill()
      recorderProc = null
      setTrayIdle()
      onStatusChange?.('ready')
      console.log('Recording cancelled')
      return
    }

    if (recorderProc !== null) {
      const def =
        activeRecordingMode === 'holdOnly' && holdOnly !== null
          ? holdOnly
          : hybrid

      if (def.matchesHoldUp(keyEvent)) {
        if (sessionStarting) pendingHoldReleaseWhileStarting = true
        if (holdArmTimer !== null) clearHoldArmTimer()
        const releaseStops = activeRecordingMode === 'holdOnly' || holdQualified
        if (releaseStops) await tryStop()
        return
      }
      if (
        activeRecordingMode === 'hybrid' &&
        hybrid.matchesToggleDown(keyEvent) &&
        !keyEvent.isRepeat
      ) {
        resetHoldGate()
        await tryStop()
      }
      return
    }

    if (transcriptionPipelineActive || sessionStarting) return

    if (keyEvent.keycode === Key.rightOption) {
      rightOptionPhysicallyDown = keyEvent.keyDown
    }

    const hybridId = appConfig.getShortcutId()
    const holdId = appConfig.getShortcutHoldOnlyId()
    const deferRightOptionPtt =
      holdOnly !== null && needsRightOptionPttChordDefer(hybridId, holdId)

    if (deferRightOptionPtt) {
      if (hybrid.matchesToggleDown(keyEvent) && !keyEvent.isRepeat) {
        clearRightOptionPttDeferTimer()
        await tryStart('hybrid')
        return
      }
      if (keyEvent.keycode === Key.rightOption && !keyEvent.keyDown) {
        clearRightOptionPttDeferTimer()
        return
      }
      if (holdOnly.matchesToggleDown(keyEvent) && !keyEvent.isRepeat) {
        clearRightOptionPttDeferTimer()
        rightOptionPttDeferTimer = setTimeout(() => {
          rightOptionPttDeferTimer = null
          if (
            recorderProc !== null ||
            sessionStarting ||
            transcriptionPipelineActive ||
            !rightOptionPhysicallyDown
          ) {
            return
          }
          void tryStart('holdOnly')
        }, RIGHT_OPTION_PTT_DEFER_MS)
        return
      }
    } else {
      clearRightOptionPttDeferTimer()
    }

    const fnGlobeDef = SHORTCUTS['fn-globe']
    const deferFnGlobeForFnChord =
      holdOnly !== null && holdFnChordConflictsWithFnGlobeMain(hybridId, holdId)

    if (deferFnGlobeForFnChord) {
      if (pendingFnGlobeHybridDefer) {
        if (holdOnly.matchesToggleDown(keyEvent) && !keyEvent.isRepeat) {
          pendingFnGlobeHybridDefer = false
          await tryStart('holdOnly')
          return
        }
        if (fnGlobeDef.matchesHoldUp(keyEvent)) {
          pendingFnGlobeHybridDefer = false
          await tryStart('hybrid')
          return
        }
        if (
          keyEvent.keyDown &&
          !keyEvent.isRepeat &&
          !FN_GLOBE_DEFER_CANCEL_SUPPRESS.has(keyEvent.keycode)
        ) {
          pendingFnGlobeHybridDefer = false
          // Fall through: e.g. unrelated key — may match nothing.
        } else {
          return
        }
      } else if (
        hybrid.matchesToggleDown(keyEvent) &&
        !keyEvent.isRepeat &&
        FN_PHYSICAL_KEYCODES.includes(
          keyEvent.keycode as (typeof FN_PHYSICAL_KEYCODES)[number]
        )
      ) {
        pendingFnGlobeHybridDefer = true
        return
      }
    } else {
      pendingFnGlobeHybridDefer = false
    }

    if (
      holdOnly !== null &&
      holdOnly.matchesToggleDown(keyEvent) &&
      !keyEvent.isRepeat
    ) {
      await tryStart('holdOnly')
      return
    }
    if (hybrid.matchesToggleDown(keyEvent) && !keyEvent.isRepeat) {
      await tryStart('hybrid')
    }
  }

  const relayPermissions = onPermissions
    ? (status: PermissionStatus) => {
        void (async () => {
          let microphone = status.microphone
          try {
            microphone = await checkMicrophoneAuthorization()
          } catch {
            /* MicRecorder missing in some dev setups — keep KeyListener value */
          }
          onPermissions({ ...status, microphone })
        })()
      }
    : undefined

  const keyboard = startKeyboardListener(
    (keyEvent) => {
      void handleKeyEvent(keyEvent)
    },
    getMergedSwallowRules(),
    relayPermissions
  )

  return keyboard
}
