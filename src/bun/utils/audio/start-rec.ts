import { AppConfig } from '../../AppConfig/AppConfig'
import { speech2text, RECORDING_PATH } from '../whisper/speech2text'
import { duckDelayAfterStartChimeMs, playEndSound } from '../sound/play-sound'
import { findMicRecorderBinary } from './find-mic-recorder'
import { findDevices } from './devices'
import { log } from '../logger'
import { stat } from 'node:fs/promises'

/** Set `discard: true` before killing the recorder so onExit skips transcription and UI handoff. */
export type RecordingSession = { discard: boolean; startedAtMs: number }

const WAV_HEADER_BYTES = 44
const PCM_16BIT_MONO_48KHZ_BYTES_PER_MS = 96
const MIN_VALID_RECORDING_MS = 180

function estimateWavDurationMs(sizeBytes: number): number {
  const pcmBytes = Math.max(0, sizeBytes - WAV_HEADER_BYTES)
  return Math.floor(pcmBytes / PCM_16BIT_MONO_48KHZ_BYTES_PER_MS)
}

async function shouldSkipTranscriptionForShortCapture(
  session: RecordingSession
): Promise<{
  skip: boolean
  reason?: 'missing-file' | 'stale-file' | 'too-short'
  sizeBytes?: number
  durationMs?: number
}> {
  try {
    const fileStats = await stat(RECORDING_PATH)
    const durationMs = estimateWavDurationMs(fileStats.size)
    const fileLooksFresh = fileStats.mtimeMs >= session.startedAtMs - 50

    if (!fileLooksFresh) {
      return {
        skip: true,
        reason: 'stale-file',
        sizeBytes: fileStats.size,
        durationMs,
      }
    }

    if (durationMs < MIN_VALID_RECORDING_MS) {
      return {
        skip: true,
        reason: 'too-short',
        sizeBytes: fileStats.size,
        durationMs,
      }
    }

    return { skip: false, sizeBytes: fileStats.size, durationMs }
  } catch {
    return { skip: true, reason: 'missing-file' }
  }
}

export const startRecording = async (
  appConfig: AppConfig,
  onComplete: () => void,
  onDone: () => void,
  session: RecordingSession,
  /** Live snapshot from the main process (refreshed at startup + on an interval). Avoids spawning `MicRecorder --list-devices` on every shortcut press. */
  getDeviceMap?: () => Record<string, string>
) => {
  if (appConfig.getStreamMode()) {
    log(
      'stream',
      'unexpected fallback into MicRecorder while stream mode is enabled'
    )
  }

  const micPath = await findMicRecorderBinary()

  let currentDevices = getDeviceMap?.() ?? {}
  if (Object.keys(currentDevices).length === 0) {
    currentDevices = await findDevices()
  }
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
  const outputDuckDelayMs = duckDelayAfterStartChimeMs(
    appConfig.getFunModeEnabled()
  )
  const duckLevel = appConfig.getAudioDuckingLevel()
  const duckIncludeHeadphones = appConfig.getAudioDuckingIncludeHeadphones()
  const duckIncludeBuiltIn = appConfig.getAudioDuckingIncludeBuiltInSpeakers()

  const proc = Bun.spawn(
    [
      micPath,
      'record',
      RECORDING_PATH,
      String(device),
      String(maxRecordSeconds),
      String(outputDuckDelayMs),
      String(duckLevel),
      duckIncludeHeadphones ? '1' : '0',
      duckIncludeBuiltIn ? '1' : '0',
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
        const recordingCheck =
          session.discard || forceCancelled
            ? { skip: false as const }
            : await shouldSkipTranscriptionForShortCapture(session)
        const skipPipeline =
          session.discard || forceCancelled || recordingCheck.skip

        if (recordingCheck.skip) {
          log('mic', 'skipping transcription for invalid capture', {
            reason: recordingCheck.reason,
            sizeBytes: recordingCheck.sizeBytes,
            durationMs: recordingCheck.durationMs,
            minDurationMs: MIN_VALID_RECORDING_MS,
          })
        }

        if (!skipPipeline) {
          onComplete()
          playEndSound(appConfig.getFunModeEnabled())
          await speech2text(
            appConfig.getRuntimeTranscriptionWhisperCode(),
            appConfig.getWhisperModelId(),
            appConfig.getTranslateToEnglish(),
            appConfig.getFormattingRuntimeSettings(),
            appConfig.getDictionaryEntries(),
            () => appConfig.acceptPreviouslyAppliedEntries(),
            (entries) => appConfig.notifyAppliedEntries(entries)
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
