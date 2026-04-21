import { describe, expect, test } from 'bun:test'
import {
  AUTO_LEARN_COMMIT_THRESHOLD,
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
  test('stages the first correction hit', () => {
    const result = stageDictionaryCandidate({
      candidates: [],
      entries: [],
      original: 'Alice',
      corrected: 'Aliz',
    })

    expect(result.outcome).toBe('staged')
    expect(result.committedEntry).toBeNull()
    expect(result.candidates).toEqual([
      { from: 'Alice', to: 'Aliz', corrections: 1 },
    ])
  })

  test('commits after the repeat threshold', () => {
    const result = stageDictionaryCandidate({
      candidates: [
        {
          from: 'Alice',
          to: 'Aliz',
          corrections: AUTO_LEARN_COMMIT_THRESHOLD - 1,
        },
      ],
      entries: [],
      original: 'Alice',
      corrected: 'Aliz',
    })

    expect(result.outcome).toBe('committed')
    expect(result.committedEntry).toEqual({
      kind: 'replacement',
      from: 'Alice',
      text: 'Aliz',
    })
    expect(result.candidates).toEqual([])
  })

  test('replaces a conflicting candidate for the same original phrase', () => {
    const result = stageDictionaryCandidate({
      candidates: [{ from: 'Alice', to: 'Elise', corrections: 1 }],
      entries: [],
      original: 'Alice',
      corrected: 'Aliz',
    })

    expect(result.outcome).toBe('staged')
    expect(result.candidates).toEqual([
      { from: 'Alice', to: 'Aliz', corrections: 1 },
    ])
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
