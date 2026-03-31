import { AppConfig } from '../../AppConfig/AppConfig'
import { speech2text, RECORDING_PATH } from '../whisper/speech2text'
import { playEndSound } from '../sound/play-sound'
import { findFfmpegBinary } from './find-ffmpeg'
import { findDevices } from './devices'
import { log } from '../logger'

export const startRecording = async (
  appConfig: AppConfig,
  onComplete: () => void,
  onDone: () => void
) => {
  const ffmpegPath = await findFfmpegBinary()

  // Log binary architecture so we can spot Rosetta-related failures
  const lipoResult = Bun.spawnSync(['lipo', '-info', ffmpegPath], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const lipoStdout = lipoResult.stdout.toString().trim()
  const arch = lipoStdout || lipoResult.stderr.toString().trim()
  log('ffmpeg', 'binary info', { path: ffmpegPath, arch })

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

  log('ffmpeg', 'resolved audio device', {
    index: device,
    name: currentDevices[device.toString()] ?? 'unknown',
    requestedIndex: resolved,
    deviceExists,
  })

  const ffmpeg = Bun.spawn(
    [
      ffmpegPath,
      '-y',
      '-f',
      'avfoundation',
      '-i',
      `:${device}`,
      '-t',
      '120',
      RECORDING_PATH,
    ],
    {
      stderr: 'pipe',
      stdin: 'pipe',
      async onExit(proc, exitCode) {
        let stderrText = ''
        try {
          stderrText = await new Response(proc.stderr).text()
        } catch {
          // Ignore — stderr may already be consumed
        }

        log('ffmpeg', `exited`, {
          exitCode,
          stderr: stderrText.slice(0, 500) || undefined,
        })

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

  log('ffmpeg', 'spawned', { pid: ffmpeg.pid })

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
