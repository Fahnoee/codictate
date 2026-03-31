import { startRecording, stopRecording } from './utils/audio/start-rec'
import {
  Key,
  SHORTCUTS,
  startKeyboardListener,
  type PermissionStatus,
} from './utils/keyboard/keyboard-events'
import { playStartSound } from './utils/sound/play-sound'
import { AppConfig } from './AppConfig/AppConfig'
import type { TrayHandlers } from './setup-tray'
import type { AppStatus } from '../shared/types'

export const setupRecording = (
  appConfig: AppConfig,
  { setTrayIdle, setTrayRecording, setTrayTranscribing }: TrayHandlers,
  onStatusChange?: (status: AppStatus) => void,
  onPermissions?: (status: PermissionStatus) => void
) => {
  let recorderProc: ReturnType<typeof Bun.spawn> | null = null
  const shortcut = SHORTCUTS[appConfig.getShortcutId()]

  const keyboard = startKeyboardListener(
    async (keyEvent) => {
      const isShortcut = shortcut.isMatch(keyEvent)

      if (isShortcut && recorderProc === null) {
        console.log('START RECORD')
        playStartSound()
        setTrayRecording()
        onStatusChange?.('recording')
        recorderProc = await startRecording(
          appConfig,
          () => {
            recorderProc = null
            setTrayTranscribing()
            onStatusChange?.('transcribing')
          },
          () => {
            setTrayIdle()
            onStatusChange?.('ready')
          }
        )
        return
      }

      if (isShortcut && recorderProc) {
        console.log('END RECORD')
        await stopRecording(recorderProc)
        recorderProc = null
        return
      }

      if (keyEvent.keycode === Key.escape && recorderProc) {
        recorderProc.kill()
        recorderProc = null
        setTrayIdle()
        onStatusChange?.('ready')
        console.log('Recording cancelled')
      }
    },
    [shortcut.swallowRule],
    onPermissions
  )

  return keyboard
}
