import { describe, expect, test } from 'bun:test'
import {
  invalidateDictionaryCandidatesForText,
  parseDictionaryCandidates,
  stageDictionaryCandidate,
} from './auto-learn-candidates'

describe('parseDictionaryCandidates', () => {
  test('deduplicates and normalizes persisted candidates', () => {
    expect(
      parseDictionaryCandidates([
        { from: ' Alice ', to: ' Aliz ', corrections: 1 },
        { from: 'alice', to: 'aliz', corrections: 2 },
        { from: '', to: 'Aliz' },
      ])
    ).toEqual([{ from: 'Alice', to: 'Aliz', corrections: 1 }])
  })
})

describe('stageDictionaryCandidate', () => {
  test('commits phonetically distant pair immediately as exact replacement', () => {
    const result = stageDictionaryCandidate({
      candidates: [],
      entries: [],
      original: 'Alice',
      corrected: 'Aliz',
    })

    expect(result.outcome).toBe('committed')
    expect(result.committedEntry).toEqual({
      kind: 'replacement',
      from: 'Alice',
      text: 'Aliz',
      confidence: 1,
      timesApplied: 0,
      timesAccepted: 0,
      timesReverted: 0,
    })
    expect(result.candidates).toEqual([])
  })

  test('commits near-homophone pair immediately as fuzzy entry', () => {
    const result = stageDictionaryCandidate({
      candidates: [],
      entries: [],
      original: 'Electrobon',
      corrected: 'Electrobun',
    })

    expect(result.outcome).toBe('committed')
    expect(result.committedEntry).toEqual({
      kind: 'fuzzy',
      text: 'Electrobun',
      confidence: 1,
      timesApplied: 0,
      timesAccepted: 0,
      timesReverted: 0,
    })
    expect(result.candidates).toEqual([])
  })

  test('commits split-word compound corrections immediately as fuzzy entries', () => {
    const result = stageDictionaryCandidate({
      candidates: [],
      entries: [],
      original: 'Open Claw',
      corrected: 'OpenClaw',
    })

    expect(result.outcome).toBe('committed')
    expect(result.committedEntry).toEqual({
      kind: 'fuzzy',
      text: 'OpenClaw',
      confidence: 1,
      timesApplied: 0,
      timesAccepted: 0,
      timesReverted: 0,
    })
    expect(result.candidates).toEqual([])
  })

  test('does not re-commit if fuzzy entry for corrected term already exists', () => {
    const result = stageDictionaryCandidate({
      candidates: [],
      entries: [{ kind: 'fuzzy', text: 'Electrobun', source: 'manual' }],
      original: 'Electrobon',
      corrected: 'Electrobun',
    })

    expect(result.outcome).toBe('already-committed')
    expect(result.committedEntry).toBeNull()
  })

  test('old persisted candidate with corrections below threshold is still staged', () => {
    // Candidates from before the threshold change (corrections: 0 isn't valid,
    // but corrections: 1 with threshold=1 now commits on the next hit).
    // This test documents that an existing candidate gets replaced/committed
    // when the same pair is seen again.
    const result = stageDictionaryCandidate({
      candidates: [{ from: 'Alice', to: 'Aliz', corrections: 1 }],
      entries: [],
      original: 'Alice',
      corrected: 'Aliz',
    })

    expect(result.outcome).toBe('committed')
    expect(result.candidates).toEqual([])
  })

  test('replaces a conflicting candidate for the same original phrase and commits immediately', () => {
    const result = stageDictionaryCandidate({
      candidates: [{ from: 'Alice', to: 'Elise', corrections: 1 }],
      entries: [],
      original: 'Alice',
      corrected: 'Aliz',
    })

    expect(result.outcome).toBe('committed')
    expect(result.candidates).toEqual([])
  })
})

describe('invalidateDictionaryCandidatesForText', () => {
  test('removes candidates whose original appears unchanged again', () => {
    const result = invalidateDictionaryCandidatesForText(
      [
        { from: 'Alice', to: 'Aliz', corrections: 1 },
        { from: 'BTW', to: 'by the way', corrections: 1 },
      ],
      "My girlfriend's name is Alice."
    )

    expect(result.removed).toEqual([
      { from: 'Alice', to: 'Aliz', corrections: 1 },
    ])
    expect(result.candidates).toEqual([
      { from: 'BTW', to: 'by the way', corrections: 1 },
    ])
  })
})
