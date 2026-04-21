import type {
  DictionaryCandidate,
  DictionaryEntry,
} from '../../../shared/types'
import { ratio } from './apply-dictionary'

export const AUTO_LEARN_COMMIT_THRESHOLD = 2

// Single-word corrections with high character similarity are variants of the
// same proper noun (e.g. "Electrobon" → "Electrobun") and benefit from fuzzy
// matching, which catches all future near-homophones automatically.
// Corrections below this threshold are phonetically distinct (e.g. "Ollies" →
// "Aliz") and need a stable exact mapping instead.
const FUZZY_PROMOTE_RATIO_THRESHOLD = 80

function classifyAutoLearnEntry(
  original: string,
  corrected: string
): DictionaryEntry['kind'] {
  if (corrected.includes(' ')) return 'replacement'
  return ratio(original.toLowerCase(), corrected.toLowerCase()) >=
    FUZZY_PROMOTE_RATIO_THRESHOLD
    ? 'fuzzy'
    : 'replacement'
}

function normalizeSpaces(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeCandidateText(value: string): string {
  return normalizeSpaces(value).toLowerCase()
}

function candidateKey(
  candidate: Pick<DictionaryCandidate, 'from' | 'to'>
): string {
  return `${normalizeCandidateText(candidate.from)}=>${normalizeCandidateText(candidate.to)}`
}

function replacementKey(
  entry: Pick<DictionaryEntry, 'kind' | 'text' | 'from'>
): string {
  return `replacement:${normalizeCandidateText(entry.from ?? '')}=>${normalizeCandidateText(entry.text)}`
}

export function parseDictionaryCandidates(
  value: unknown
): DictionaryCandidate[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const parsed: DictionaryCandidate[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const from =
      typeof record.from === 'string' ? normalizeSpaces(record.from) : ''
    const to = typeof record.to === 'string' ? normalizeSpaces(record.to) : ''
    const corrections =
      typeof record.corrections === 'number' &&
      Number.isFinite(record.corrections) &&
      record.corrections > 0
        ? Math.round(record.corrections)
        : 1

    if (!from || !to) continue
    const key = candidateKey({ from, to })
    if (seen.has(key)) continue
    seen.add(key)
    parsed.push({ from, to, corrections })
  }

  return parsed
}

export function stageDictionaryCandidate(params: {
  candidates: DictionaryCandidate[]
  entries: DictionaryEntry[]
  original: string
  corrected: string
}): {
  candidates: DictionaryCandidate[]
  committedEntry: Omit<DictionaryEntry, 'source'> | null
  outcome: 'ignored' | 'staged' | 'committed' | 'already-committed'
} {
  const original = normalizeSpaces(params.original)
  const corrected = normalizeSpaces(params.corrected)
  if (!original || !corrected) {
    return {
      candidates: params.candidates,
      committedEntry: null,
      outcome: 'ignored',
    }
  }

  const kind = classifyAutoLearnEntry(original, corrected)
  const alreadyCommitted =
    kind === 'fuzzy'
      ? params.entries.some(
          (entry) =>
            entry.kind === 'fuzzy' &&
            normalizeCandidateText(entry.text) ===
              normalizeCandidateText(corrected)
        )
      : params.entries.some(
          (entry) =>
            entry.kind === 'replacement' &&
            replacementKey(entry) ===
              replacementKey({ kind: 'replacement', from: original, text: corrected })
        )

  if (alreadyCommitted) {
    return {
      candidates: params.candidates.filter(
        (candidate) =>
          candidateKey(candidate) !==
          candidateKey({ from: original, to: corrected })
      ),
      committedEntry: null,
      outcome: 'already-committed',
    }
  }

  const normalizedOriginal = normalizeCandidateText(original)
  const normalizedPair = candidateKey({ from: original, to: corrected })
  const existing = params.candidates.find(
    (candidate) => candidateKey(candidate) === normalizedPair
  )
  const nextCount = (existing?.corrections ?? 0) + 1
  const withoutSameOriginal = params.candidates.filter(
    (candidate) => normalizeCandidateText(candidate.from) !== normalizedOriginal
  )

  if (nextCount >= AUTO_LEARN_COMMIT_THRESHOLD) {
    const committedEntry: Omit<DictionaryEntry, 'source'> =
      kind === 'fuzzy'
        ? { kind: 'fuzzy', text: corrected }
        : { kind: 'replacement', from: original, text: corrected }
    return {
      candidates: withoutSameOriginal,
      committedEntry,
      outcome: 'committed',
    }
  }

  return {
    candidates: [
      ...withoutSameOriginal,
      { from: original, to: corrected, corrections: nextCount },
    ],
    committedEntry: null,
    outcome: 'staged',
  }
}

export function invalidateDictionaryCandidatesForText(
  candidates: DictionaryCandidate[],
  text: string
): {
  candidates: DictionaryCandidate[]
  removed: DictionaryCandidate[]
} {
  const normalizedText = normalizeCandidateText(text)
  if (!normalizedText) {
    return { candidates, removed: [] }
  }

  const kept: DictionaryCandidate[] = []
  const removed: DictionaryCandidate[] = []

  for (const candidate of candidates) {
    if (normalizedText.includes(normalizeCandidateText(candidate.from))) {
      removed.push(candidate)
    } else {
      kept.push(candidate)
    }
  }

  return { candidates: kept, removed }
}
