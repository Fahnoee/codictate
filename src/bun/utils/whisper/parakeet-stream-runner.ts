// Parakeet stream mode: spawn CodictateParakeetHelper only. The helper captures mic,
// runs the model, and pastes — nothing is read from stdout.
//
// Live-mode tracing: set CODICTATE_LIVE_DEBUG=1 in the environment before starting
// Codictate; stderr lines tagged stream [live][debug] are forwarded below as parakeet stderr.

import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { StreamTranscriptionMode } from '../../../shared/types'
import { modelManager } from './model-manager'
import { log } from '../logger'
import { duckDelayAfterStartChimeMs } from '../sound/play-sound'

export type StreamHandlers = {
  onStopped: () => void
}

export type StreamSession = {
  proc: ReturnType<typeof Bun.spawn>
  streamDebugId?: number
}

export type ParakeetStreamStartOptions = {
  /** Log correlation: forwarded to helper as `CODICTATE_STREAM_DEBUG_ID` (stderr prefix `[sN]`). */
  streamDebugId?: number
}

const PARAKEET_MODEL_ID = 'parakeet-tdt-0.6b-v3'

function resolveParakeetHelperBinary(): string {
  return join(import.meta.dir, '../native-helpers/CodictateParakeetHelper')
}

export function assertParakeetStreamRuntimeReady(): void {
  const binary = resolveParakeetHelperBinary()
  if (!existsSync(binary)) {
    throw new Error(
      'CodictateParakeetHelper is missing. Run pre-build / build:native to build the Parakeet helper.'
    )
  }
  if (!modelManager.isModelAvailable(PARAKEET_MODEL_ID)) {
    throw new Error(
      'Parakeet model is not installed. Download Parakeet TDT v3 in Settings to use stream mode.'
    )
  }
}

export async function startParakeetStream(
  streamTranscriptionMode: StreamTranscriptionMode,
  handlers: StreamHandlers,
  options?: ParakeetStreamStartOptions
): Promise<StreamSession> {
  assertParakeetStreamRuntimeReady()
  const binary = resolveParakeetHelperBinary()
  const modelDir = modelManager.getParakeetInstallDir(PARAKEET_MODEL_ID)
  const modeArg = streamTranscriptionMode === 'vad' ? 'vad' : 'live'
  const args = [binary, 'stream', modeArg, modelDir]
  const streamDebugId = options?.streamDebugId
  const outputDuckDelayMs = duckDelayAfterStartChimeMs()

  log(
    'stream',
    'spawning CodictateParakeetHelper (helper handles capture + paste)',
    {
      binary,
      streamArgs: ['stream', modeArg, modelDir],
      streamTranscriptionMode,
      modelDir,
      streamDebugId,
      outputDuckDelayMs,
    }
  )

  const proc = Bun.spawn(args, {
    stdout: 'ignore',
    stderr: 'pipe',
    stdin: 'ignore',
    env: {
      ...process.env,
      LC_ALL: 'en_US.UTF-8',
      LANG: 'en_US.UTF-8',
      CODICTATE_OUTPUT_DUCK_DELAY_MS: String(outputDuckDelayMs),
      ...(streamDebugId != null
        ? { CODICTATE_STREAM_DEBUG_ID: String(streamDebugId) }
        : {}),
    },
  })

  log('stream', 'spawned Parakeet stream process', {
    pid: proc.pid,
    streamDebugId,
  })

  void (async () => {
    try {
      const reader = proc.stderr.getReader()
      const decoder = new TextDecoder('utf-8')
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          const t = line.trim()
          if (t) log('stream', 'parakeet stderr', { text: t.slice(0, 500) })
        }
      }
    } catch (err) {
      log('stream', 'parakeet stderr read error', { err: String(err) })
    }
  })()

  void proc.exited.then(() => {
    log('stream', 'parakeet stream process exited', {
      exitCode: proc.exitCode,
      streamDebugId,
    })
    handlers.onStopped()
  })

  return { proc, streamDebugId }
}

export async function stopParakeetStream(
  session: StreamSession
): Promise<void> {
  session.proc.kill('SIGINT')
  await session.proc.exited
}
