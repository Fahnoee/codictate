import { pasteTranscript } from '../keyboard/keyboard-events'
import { join } from 'node:path'
import { log } from '../logger'

export const RECORDING_PATH = '/tmp/codictate-recording.wav'

const whisperLanguage = 'auto'

export const transcribe = async () => {
  const binary = join(import.meta.dir, '../native-helpers/whisper-cli')
  // We landed on this model becuase it can detect
  // multiple languages and it is fast and very accurate.
  const model = join(
    import.meta.dir,
    '../native-helpers/ggml-large-v3-turbo-q5_0.bin'
  )

  log('whisper', 'spawning whisper-cli', { binary, model, whisperLanguage })

  const proc = Bun.spawn(
    [
      binary,
      '-m',
      model,
      '-l',
      whisperLanguage,
      '-f',
      RECORDING_PATH,
      '--no-prints',
      '-nt', // No timestamps
    ],
    {
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        // Avoid C locale / missing UTF-8 so whisper-cli prints UTF-8 transcript
        LC_ALL: 'en_US.UTF-8',
        LANG: 'en_US.UTF-8',
      },
    }
  )

  await proc.exited

  let stderrText = ''
  try {
    stderrText = new TextDecoder('utf-8').decode(
      await new Response(proc.stderr).arrayBuffer()
    )
  } catch {
    // Ignore — stderr may already be consumed
  }

  const stdoutBytes = await new Response(proc.stdout).arrayBuffer()
  const transcript = new TextDecoder('utf-8').decode(stdoutBytes).trim()

  log('whisper', 'transcription complete', {
    exitCode: proc.exitCode,
    transcriptLength: transcript.length,
    stderr: stderrText.slice(0, 500) || undefined,
  })

  return transcript
}

export const speech2text = async () => {
  const transcript = await transcribe()
  await pasteTranscript(transcript)
}
