import { startRecording, stopRecording } from './utils/ffmpeg/start-rec'
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
  let ffmpeg: ReturnType<typeof Bun.spawn> | null = null
  const shortcut = SHORTCUTS[appConfig.getShortcutId()]

  const keyboard = startKeyboardListener(
    async (keyEvent) => {
      const isShortcut = shortcut.isMatch(keyEvent)

      if (isShortcut && ffmpeg === null) {
        console.log('START RECORD')
        playStartSound()
        setTrayRecording()
        onStatusChange?.('recording')
        ffmpeg = await startRecording(
          appConfig,
          () => {
            ffmpeg = null
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

      if (isShortcut && ffmpeg) {
        console.log('END RECORD')
        await stopRecording(ffmpeg)
        ffmpeg = null
        return
      }

      if (keyEvent.keycode === Key.escape && ffmpeg) {
        ffmpeg.kill()
        ffmpeg = null
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
