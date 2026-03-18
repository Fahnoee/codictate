import {
  copyToClipboard,
  pasteToActiveWindow,
} from '../keyboard/keyboard-events'
import { join } from 'node:path'
import { log } from '../logger'

export const RECORDING_PATH = '/tmp/codictate-recording.wav'

export const transcribe = async () => {
  const binary = join(import.meta.dir, '../native-helpers/whisper-cli')
  const model = join(import.meta.dir, '../native-helpers/ggml-base.en.bin')

  log('whisper', 'spawning whisper-cli', { binary, model })

  const proc = Bun.spawn(
    [
      binary,
      '-m',
      model,
      '-f',
      RECORDING_PATH,
      '--no-prints',
      '-nt', // No timestamps
    ],
    { stdout: 'pipe', stderr: 'pipe' }
  )

  await proc.exited

  let stderrText = ''
  try {
    stderrText = await new Response(proc.stderr).text()
  } catch {
    // Ignore — stderr may already be consumed
  }

  const out = await proc.stdout.text()
  const transcript = out.trim()

  log('whisper', 'transcription complete', {
    exitCode: proc.exitCode,
    transcriptLength: transcript.length,
    stderr: stderrText.slice(0, 500) || undefined,
  })

  return transcript
}

export const speech2text = async () => {
  const transcript = await transcribe()
  await copyToClipboard(transcript)
  await pasteToActiveWindow()
}
