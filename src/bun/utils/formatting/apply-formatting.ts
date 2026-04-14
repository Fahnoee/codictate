import type { FormattingModeId } from '../../../shared/formatting-modes'
import { log } from '../logger'
import { findFormatterHelperPath } from './formatting-availability'

/**
 * Calls CodictateFormatterHelper to reformat `text` using Apple FoundationModels.
 * Returns the formatted text on success, or the original `text` on any failure
 * (missing binary, macOS < 26, Apple Intelligence unavailable, etc.).
 */
export async function applyFormatting(
  text: string,
  modeId: FormattingModeId
): Promise<string> {
  if (modeId === 'none' || !text.trim()) return text

  try {
    const helper = await findFormatterHelperPath()

    log('formatter', 'spawning CodictateFormatterHelper', { modeId, helper })

    const proc = Bun.spawn([helper, modeId, text], {
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const [stdoutBytes, stderrBytes] = await Promise.all([
      readStream(proc.stdout),
      readStream(proc.stderr),
    ])
    await proc.exited

    const stderrText = new TextDecoder('utf-8').decode(stderrBytes).trim()
    if (stderrText) {
      log('formatter', 'helper stderr', { text: stderrText.slice(0, 500) })
    }

    if (proc.exitCode !== 0) {
      log(
        'formatter',
        'helper exited with non-zero code — using raw transcript',
        {
          exitCode: proc.exitCode,
        }
      )
      return text
    }

    const formatted = new TextDecoder('utf-8').decode(stdoutBytes).trim()
    if (!formatted) {
      log('formatter', 'empty output from helper — using raw transcript')
      return text
    }

    log('formatter', 'formatting complete', {
      originalLength: text.length,
      formattedLength: formatted.length,
    })
    return formatted
  } catch (err) {
    log('formatter', 'failed to spawn helper — using raw transcript', {
      error: String(err),
    })
    return text
  }
}

async function readStream(
  stream: ReadableStream<Uint8Array> | undefined
): Promise<Uint8Array> {
  if (!stream) return new Uint8Array(0)
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value?.length) chunks.push(value)
  }
  const total = chunks.reduce((a, b) => a + b.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}
