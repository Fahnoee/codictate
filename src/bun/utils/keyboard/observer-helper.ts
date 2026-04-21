import { join } from 'node:path'
import { log } from '../logger'
import { extractCorrections } from '../dictionary/apply-dictionary'
import type { DictionaryEntry } from '../../../shared/types'

let observerSend: ((cmd: string) => void) | null = null
let pendingObservedText: string | null = null

function scopeObservedChange(
  originalText: string,
  currentText: string,
  targetText: string | null
): {
  originalText: string
  currentText: string
  scoped: boolean
} {
  if (!targetText || targetText.length === 0) {
    return { originalText, currentText, scoped: false }
  }

  const start = originalText.lastIndexOf(targetText)
  if (start === -1) {
    return { originalText, currentText, scoped: false }
  }

  const lengthDelta = currentText.length - originalText.length
  const scopedStart = start
  const scopedEndBefore = start + targetText.length
  const scopedEndAfter = Math.max(
    scopedStart,
    Math.min(currentText.length, scopedEndBefore + lengthDelta)
  )

  return {
    originalText: originalText.slice(scopedStart, scopedEndBefore),
    currentText: currentText.slice(scopedStart, scopedEndAfter),
    scoped: true,
  }
}

export function startObserverHelper(
  onCorrection: (candidate: { original: string; corrected: string }) => void,
  isAutoLearnEnabled: () => boolean,
  _getDictionaryEntries: () => DictionaryEntry[]
) {
  const binaryPath = join(
    import.meta.dir,
    '../native-helpers/CodictateObserverHelper'
  )

  let proc: ReturnType<typeof Bun.spawn>
  try {
    proc = Bun.spawn([binaryPath], { stdout: 'pipe', stdin: 'pipe' })
  } catch {
    log('observer', 'CodictateObserverHelper not found — auto-learn disabled')
    return
  }

  log('observer', 'CodictateObserverHelper spawned', { binaryPath })

  const stdin = proc.stdin
  const stdout = proc.stdout
  if (
    !stdin ||
    typeof stdin === 'number' ||
    !stdout ||
    typeof stdout === 'number'
  ) {
    log(
      'observer',
      'CodictateObserverHelper pipe setup failed — auto-learn disabled'
    )
    proc.kill()
    return
  }

  const send = (cmd: object) => {
    try {
      stdin.write(JSON.stringify(cmd) + '\n')
      stdin.flush()
    } catch {
      // process may have exited
    }
  }

  observerSend = (command: string) => {
    log('observer', 'sending command to helper', { command })
    send({ command })
  }

  proc.exited.then((code) => {
    log('observer', 'CodictateObserverHelper exited', { code })
    observerSend = null
  })

  const reader = stdout.getReader()
  const decoder = new TextDecoder()

  ;(async () => {
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line) as Record<string, unknown>
          if (msg.type === 'correction') {
            log('observer', 'received correction event', {
              originalText: String(msg.originalText ?? ''),
              currentText: String(msg.currentText ?? ''),
              autoLearnEnabled: isAutoLearnEnabled(),
            })
            if (!isAutoLearnEnabled()) continue
            const observedBefore = String(msg.originalText ?? '')
            const observedAfter = String(msg.currentText ?? '')
            const scopedChange = scopeObservedChange(
              observedBefore,
              observedAfter,
              pendingObservedText
            )
            const originalText = scopedChange.originalText
            const currentText = scopedChange.currentText
            const candidates = extractCorrections(originalText, currentText)
            log('observer', 'extractCorrections result', {
              scopedToPastedText: scopedChange.scoped,
              comparedOriginalText: originalText,
              comparedCurrentText: currentText,
              candidateCount: candidates.length,
              candidates: candidates.map(
                (c) => `${c.original} → ${c.corrected}`
              ),
            })
            for (const candidate of candidates) {
              log('observer', 'auto-learned correction', {
                original: candidate.original,
                corrected: candidate.corrected,
              })
              onCorrection(candidate)
            }
          } else if (msg.type === 'ready') {
            log('observer', 'CodictateObserverHelper ready')
          } else if (msg.type === 'unsupported') {
            log('observer', 'app does not expose AX text — auto-learn skipped')
          }
        } catch {
          // ignore malformed output
        }
      }
    }
  })()
}

export function observerStartWatch(targetText?: string) {
  if (!observerSend) {
    log('observer', 'observerStartWatch called but helper is not running')
    return
  }
  pendingObservedText = targetText ?? null
  observerSend('observe')
}

export function observerCancel() {
  pendingObservedText = null
  if (!observerSend) return
  observerSend('cancel')
}
