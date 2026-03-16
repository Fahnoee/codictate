import { AppConfig } from '../../AppConfig/AppConfig'
import { speech2text, RECORDING_PATH } from '../whisper/speech2text'
import { playEndSound } from '../sound/play-sound'
import { findFfmpegBinary } from './find-ffmpeg'
import { findDevices } from './devices'

export const startRecording = async (
  appConfig: AppConfig,
  onComplete: () => void,
  onDone: () => void
) => {
  const ffmpegPath = await findFfmpegBinary()

  // Re-fetch devices at record time so disconnected devices are detected.
  const currentDevices = await findDevices()
  const resolved = appConfig.resolveAudioDevice(currentDevices)

  // Validate the resolved index actually exists right now. If it doesn't
  // (e.g. AirPods disconnected), fall back to the first available device.
  const deviceExists = resolved.toString() in currentDevices
  const device = deviceExists
    ? resolved
    : Number(Object.keys(currentDevices)[0] ?? '0')

  if (!deviceExists) {
    console.warn(
      `[recording] device ${resolved} not available, falling back to device ${device} (${currentDevices[device.toString()] ?? 'unknown'})`
    )
  }

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
      '120',
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
  const { stdin } = ffmpegService
  if (!stdin || typeof stdin === 'number') return
  stdin.write('q')
  stdin.flush()
  await ffmpegService.exited
}
