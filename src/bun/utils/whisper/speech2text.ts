import { whisperCliLanguageArg } from '../../../shared/transcription-languages'
import { pasteTranscript } from '../keyboard/keyboard-events'
import { join } from 'node:path'
import { log } from '../logger'

export const RECORDING_PATH = '/tmp/codictate-recording.wav'

/**
 * Whisper often splits or mishears the product name — normalize before paste.
 * Order: phrase mishearings first, then codec+tate|tape (incl. Codec Tate, Codec Tape, glued forms), then kodictate/codictate (any casing).
 */
const BRAND_TRANSCRIPT_FIXES: [RegExp, string][] = [
  [/\bcode\s+dictate\b/gi, 'Codictate'],
  [/\bco(?:\s+|[-–—]\s*)dictate\b/gi, 'Codictate'],
  [/\bkodi\s+dicate\b/gi, 'Codictate'],
  [/\bcodec\s*t(?:ate|ape)\b/gi, 'Codictate'],
  [/\bkodictate\b/gi, 'Codictate'],
  [/\bcodictate\b/gi, 'Codictate'],
]

function fixBrandMishearings(text: string): string {
  let t = text
  for (const [pattern, replacement] of BRAND_TRANSCRIPT_FIXES) {
    t = t.replace(pattern, replacement)
  }
  return t
}

export const transcribe = async (
  whisperLanguageCode: string | null | undefined
) => {
  const binary = join(import.meta.dir, '../native-helpers/whisper-cli')
  // We landed on this model becuase it can detect
  // multiple languages and it is fast and very accurate.
  const model = join(
    import.meta.dir,
    '../native-helpers/ggml-large-v3-turbo-q5_0.bin'
  )

  const lang = whisperCliLanguageArg(whisperLanguageCode)

  log('whisper', 'spawning whisper-cli', {
    binary,
    model,
    whisperLanguageCode: lang,
    languageMode: lang === 'auto' ? 'auto-detect' : 'fixed',
  })

  const args = [
    binary,
    '-m',
    model,
    '--language',
    lang,
    '-f',
    RECORDING_PATH,
    '--no-prints',
    '-nt', // No timestamps
  ]

  const proc = Bun.spawn(args, {
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      // Avoid C locale / missing UTF-8 so whisper-cli prints UTF-8 transcript
      LC_ALL: 'en_US.UTF-8',
      LANG: 'en_US.UTF-8',
    },
  })

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
  const raw = new TextDecoder('utf-8').decode(stdoutBytes).trim()
  const transcript = fixBrandMishearings(raw)

  log('whisper', 'transcription complete', {
    exitCode: proc.exitCode,
    transcriptLength: transcript.length,
    stderr: stderrText.slice(0, 500) || undefined,
  })

  return transcript
}

export const speech2text = async (
  whisperLanguageCode: string | null | undefined
) => {
  const transcript = await transcribe(whisperLanguageCode)
  await pasteTranscript(transcript)
}
