import { startRecording, stopRecording } from './utils/ffmpeg/start-rec'
import { Key, startKeyboardListener } from './utils/keyboard/keyboard-events'
import { playStartSound } from './utils/sound/play-sound'
import { AppConfig } from './AppConfig/AppConfig'
import type { TrayHandlers } from './setup-tray'

export const setupRecording = (
  appConfig: AppConfig,
  { setTrayIdle, setTrayRecording, setTrayTranscribing }: TrayHandlers
) => {
  let ffmpeg: ReturnType<typeof Bun.spawn> | null = null

  const keyboard = startKeyboardListener(
    async (keyEvent) => {
      const isShortcut = keyEvent.keycode === Key.space && keyEvent.option

      if (isShortcut && ffmpeg === null) {
        console.log('START RECORD')
        playStartSound()
        setTrayRecording()
        ffmpeg = await startRecording(
          appConfig,
          () => {
            ffmpeg = null
            setTrayTranscribing()
          },
          () => setTrayIdle()
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
        console.log('Recording cancelled')
      }
    },
    [
      {
        keycode: Key.space,
        option: true,
        command: false,
        control: false,
        shift: false,
      },
    ]
  )

  return keyboard
}
