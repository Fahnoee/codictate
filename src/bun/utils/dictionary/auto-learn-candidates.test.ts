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

  test('commits phonetically distant pair as exact replacement', () => {
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

  test('commits near-homophone pair as fuzzy entry', () => {
    const result = stageDictionaryCandidate({
      candidates: [
        {
          from: 'Electrobon',
          to: 'Electrobun',
          corrections: AUTO_LEARN_COMMIT_THRESHOLD - 1,
        },
      ],
      entries: [],
      original: 'Electrobon',
      corrected: 'Electrobun',
    })

    expect(result.outcome).toBe('committed')
    expect(result.committedEntry).toEqual({
      kind: 'fuzzy',
      text: 'Electrobun',
    })
    expect(result.candidates).toEqual([])
  })

  test('does not re-commit if fuzzy entry for corrected term already exists', () => {
    const result = stageDictionaryCandidate({
      candidates: [
        {
          from: 'Electrobon',
          to: 'Electrobun',
          corrections: AUTO_LEARN_COMMIT_THRESHOLD - 1,
        },
      ],
      entries: [{ kind: 'fuzzy', text: 'Electrobun', source: 'manual' }],
      original: 'Electrobon',
      corrected: 'Electrobun',
    })

    expect(result.outcome).toBe('already-committed')
    expect(result.committedEntry).toBeNull()
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
