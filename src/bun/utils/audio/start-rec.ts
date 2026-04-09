import { AppConfig } from '../../AppConfig/AppConfig'
import { speech2text, RECORDING_PATH } from '../whisper/speech2text'
import { duckDelayAfterStartChimeMs, playEndSound } from '../sound/play-sound'
import { findMicRecorderBinary } from './find-mic-recorder'
import { findDevices } from './devices'
import { log } from '../logger'

/** Set `discard: true` before killing the recorder so onExit skips transcription and UI handoff. */
export type RecordingSession = { discard: boolean }

export const startRecording = async (
  appConfig: AppConfig,
  onComplete: () => void,
  onDone: () => void,
  session: RecordingSession
) => {
  const micPath = await findMicRecorderBinary()

  const currentDevices = await findDevices()
  const resolved = appConfig.resolveAudioDevice(currentDevices)

  const deviceExists = resolved.toString() in currentDevices
  const device = deviceExists
    ? resolved
    : Number(Object.keys(currentDevices)[0] ?? '0')

  if (!deviceExists) {
    console.warn(
      `[recording] device ${resolved} not available, falling back to device ${device} (${currentDevices[device.toString()] ?? 'unknown'})`
    )
  }

  const deviceLabel = currentDevices[device.toString()]?.trim() || 'default'

  log('mic', 'resolved audio device', {
    index: device,
    name: deviceLabel,
    requestedIndex: resolved,
    deviceExists,
    binary: micPath,
  })

  const maxRecordSeconds = appConfig.getMaxRecordingDurationSeconds()
  const outputDuckDelayMs = duckDelayAfterStartChimeMs()

  const proc = Bun.spawn(
    [
      micPath,
      'record',
      RECORDING_PATH,
      String(device),
      String(maxRecordSeconds),
      String(outputDuckDelayMs),
    ],
    {
      stderr: 'pipe',
      stdin: 'ignore',
      async onExit(proc, exitCode) {
        let stderrText = ''
        try {
          stderrText = await new Response(proc.stderr).text()
        } catch {
          // Ignore
        }

        log('mic', 'exited', {
          exitCode,
          stderr: stderrText.slice(0, 500) || undefined,
        })

        const forceCancelled =
          exitCode === 255 || exitCode === 143 || exitCode === 137
        const skipPipeline = session.discard || forceCancelled

        if (!skipPipeline) {
          onComplete()
          playEndSound()
          await speech2text(
            appConfig.getTranscriptionWhisperCode(),
            appConfig.getWhisperModelId(),
            appConfig.getTranslateToEnglish()
          )
        }
        onDone()
      },
    }
  )

  log('mic', 'spawned', {
    pid: proc.pid,
    outputDuckDelayMs,
  })

  return proc
}

export const stopRecording = async (recorder: ReturnType<typeof Bun.spawn>) => {
  recorder.kill('SIGINT')
  await recorder.exited
}
