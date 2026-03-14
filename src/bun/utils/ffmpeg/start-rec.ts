import { AppConfig } from '../../AppConfig/AppConfig'
import { speech2text, RECORDING_PATH } from '../whisper/speech2text'
import { playEndSound } from '../sound/play-sound'
import { findFfmpegBinary } from './find-ffmpeg'

export const startRecording = async (
  appConfig: AppConfig,
  onComplete: () => void,
  onDone: () => void
) => {
  const ffmpegPath = await findFfmpegBinary()
  const device = appConfig.getAudioDevice()

  const ffmpeg = Bun.spawn(
    [
      ffmpegPath,
      '-f',
      'avfoundation',
      '-i',
      `:${device}`,
      '-sample_rate',
      '44100',
      RECORDING_PATH,
      '-t',
      '120', // limit after 60 seconds
      '-y',
    ],
    {
      stderr: 'pipe',
      stdin: 'pipe',
      async onExit(_, exitCode) {
        onComplete()
        // exitCode 255 means process was killed (Escape to cancel) — skip transcription
        if (exitCode !== 255) {
          playEndSound()
          await speech2text()
        }
        onDone()
      },
    }
  )

  return ffmpeg
}

export const stopRecording = async (
  ffmpegService: ReturnType<typeof Bun.spawn>
) => {
  ffmpegService.stdin.write('q')
  ffmpegService.stdin.flush()
  await ffmpegService.exited
}
