import { log } from '../logger'
import { findFormatterHelperPath } from './formatting-availability'
import type { FormatterRequest } from './resolve-formatting-request'

function normaliseLightweightChatText(text: string): string {
  return text
    .trim()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
}

function applyDeterministicChatStyle(
  text: string,
  request: FormatterRequest
): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed

  if (request.modeId === 'imessage' && request.imessageTone === 'casual') {
    return trimmed.toLocaleLowerCase()
  }

  if (request.modeId === 'slack' && request.slackTone === 'casual') {
    return trimmed.toLocaleLowerCase()
  }

  if (request.modeId === 'document' && request.documentTone === 'casual') {
    return trimmed.toLocaleLowerCase()
  }

  return trimmed
}

function shouldBypassAiFormatting(request: FormatterRequest): boolean {
  return (
    (request.modeId === 'imessage' && request.imessageLightweight) ||
    (request.modeId === 'slack' && request.slackLightweight) ||
    (request.modeId === 'document' && request.documentLightweight)
  )
}

/**
 * Calls CodictateFormatterHelper to reformat `text` using Apple FoundationModels.
 * Returns the formatted text on success, or the original `text` on any failure
 * (missing binary, macOS < 26, Apple Intelligence unavailable, etc.).
 */
export async function applyFormatting(
  request: FormatterRequest
): Promise<string> {
  if (!request.transcript.trim()) {
    return request.transcript
  }

  if (shouldBypassAiFormatting(request)) {
    const lightweight = applyDeterministicChatStyle(
      normaliseLightweightChatText(request.transcript),
      request
    )
    log('formatter', 'using lightweight deterministic formatting', {
      modeId: request.modeId,
      imessageLightweight: request.imessageLightweight,
      slackLightweight: request.slackLightweight,
      documentLightweight: request.documentLightweight,
    })
    return lightweight || request.transcript
  }

  try {
    const helper = await findFormatterHelperPath()
    const payload = JSON.stringify(request)

    log('formatter', 'spawning CodictateFormatterHelper', {
      modeId: request.modeId,
      helper,
      focusedApp: request.focusedApp?.appName,
    })

    const proc = Bun.spawn([helper, '--request', payload], {
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
      return request.transcript
    }

    const formatted = applyDeterministicChatStyle(
      new TextDecoder('utf-8').decode(stdoutBytes),
      request
    )
    if (!formatted) {
      log('formatter', 'empty output from helper — using raw transcript')
      return request.transcript
    }

    log('formatter', 'formatting complete', {
      originalLength: request.transcript.length,
      formattedLength: formatted.length,
    })
    return formatted
  } catch (err) {
    log('formatter', 'failed to spawn helper — using raw transcript', {
      error: String(err),
    })
    return request.transcript
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
