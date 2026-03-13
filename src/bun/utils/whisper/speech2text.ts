import {
  copyToClipboard,
  pasteToActiveWindow,
} from '../keyboard/keyboard-events'
import { join } from 'node:path'

export const RECORDING_PATH = '/tmp/codictate-recording.wav'

export const transcribe = async () => {
  const binary = join(import.meta.dir, '../native-helpers/whisper-cli')
  const model = join(import.meta.dir, '../native-helpers/ggml-base.en.bin')

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
  const out = await proc.stdout.text()

  return out.trim()
}

export const speech2text = async () => {
  const transcript = await transcribe()
  await copyToClipboard(transcript)
  await pasteToActiveWindow()
}
