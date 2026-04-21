import type {
  DictionaryCandidate,
  DictionaryEntry,
} from '../../../shared/types'

export const AUTO_LEARN_COMMIT_THRESHOLD = 2

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

  const committedKey = replacementKey({
    kind: 'replacement',
    from: original,
    text: corrected,
  })
  if (
    params.entries.some(
      (entry) =>
        entry.kind === 'replacement' && replacementKey(entry) === committedKey
    )
  ) {
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
    return {
      candidates: withoutSameOriginal,
      committedEntry: {
        kind: 'replacement',
        from: original,
        text: corrected,
      },
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
