import { describe, expect, test } from 'bun:test'
import { applyDictionary, extractCorrections, ratio } from './apply-dictionary'

describe('applyDictionary', () => {
  test('applies exact replacement entries before fuzzy matching', () => {
    expect(
      applyDictionary('BTW, thanks.', [
        {
          kind: 'replacement',
          from: 'BTW',
          text: 'by the way',
          source: 'manual',
        },
      ])
    ).toBe('by the way, thanks.')
  })

  test('applies fuzzy entries to split-word compounds', () => {
    expect(
      applyDictionary('Open Claw is ready.', [
        {
          kind: 'fuzzy',
          text: 'OpenClaw',
          source: 'auto',
        },
      ])
    ).toBe('OpenClaw is ready.')
  })

  test('returns string when called without opts', () => {
    const result = applyDictionary('hello', [])
    expect(typeof result).toBe('string')
  })

  test('returns { text, appliedEntries } when trackApplied: true and a replacement matches', () => {
    const entry = {
      kind: 'replacement' as const,
      from: 'BTW',
      text: 'by the way',
      source: 'manual' as const,
    }
    const result = applyDictionary('BTW, thanks.', [entry], {
      trackApplied: true,
    })
    expect(result.text).toBe('by the way, thanks.')
    expect(result.appliedEntries).toEqual([entry])
  })

  test('returns { text, appliedEntries } when trackApplied: true and a fuzzy entry matches', () => {
    const entry = {
      kind: 'fuzzy' as const,
      text: 'OpenClaw',
      source: 'auto' as const,
    }
    const result = applyDictionary('Open Claw is ready.', [entry], {
      trackApplied: true,
    })
    expect(result.text).toBe('OpenClaw is ready.')
    expect(result.appliedEntries).toEqual([entry])
  })

  test('returns empty appliedEntries when trackApplied: true but nothing matches', () => {
    const result = applyDictionary(
      'nothing here',
      [{ kind: 'fuzzy', text: 'OpenClaw', source: 'auto' }],
      {
        trackApplied: true,
      }
    )
    expect(result.text).toBe('nothing here')
    expect(result.appliedEntries).toEqual([])
  })
})

describe('ratio scores', () => {
  const cases: [string, string][] = [
    // Near-homophones → high score → fuzzy
    ['electrobon', 'electrobun'],
    ['whisperflow', 'whisperflow'], // case-only, identical lowercased
    ['whisperflow', 'wispr flow'], // one word → two words
    // Phonetically distant → low score → exact replacement
    ['alice', 'aliz'],
    ['ollies', 'aliz'],
    ['whisperflow', 'wispr'], // truncated (the LCS-theft artifact)
    // Multi-word pairs
    ['whisperflow', 'wispr flow'],
  ]

  for (const [a, b] of cases) {
    test(`ratio("${a}", "${b}")`, () => {
      const score = ratio(a, b)
      console.log(`ratio("${a}", "${b}") = ${score.toFixed(1)}%`)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    })
  }
})

describe('extractCorrections', () => {
  test('learns a corrected proper noun even when similarity is low', () => {
    const result = extractCorrections(
      "This is a test of my girlfriend's name, Ollie's.",
      "This is a test of my girlfriend's name, Aliz."
    )
    console.log(
      `  ratio("ollies", "aliz") = ${ratio('ollies', 'aliz').toFixed(1)}%`
    )
    expect(result).toEqual([{ original: "Ollie's", corrected: 'Aliz' }])
  })

  test('learns case-only proper noun corrections', () => {
    const result = extractCorrections(
      'please email whisperflow tomorrow',
      'please email WhisperFlow tomorrow'
    )
    console.log(
      `  ratio("whisperflow", "whisperflow") = ${ratio('whisperflow', 'whisperflow').toFixed(1)}%`
    )
    expect(result).toEqual([
      { original: 'whisperflow', corrected: 'WhisperFlow' },
    ])
  })

  test('does not learn lowercase grammar edits', () => {
    expect(extractCorrections('this are fine', 'this is fine')).toEqual([])
  })

  test('learns a multi-word proper noun replacement (clean context)', () => {
    const result = extractCorrections(
      'I use Whisperflow daily',
      'I use Wispr Flow daily'
    )
    console.log(
      `  ratio("whisperflow", "wispr flow") = ${ratio('whisperflow', 'wispr flow').toFixed(1)}%`
    )
    expect(result).toEqual([
      { original: 'Whisperflow', corrected: 'Wispr Flow' },
    ])
  })

  test('learns the full replacement when LCS steals a word as equal context', () => {
    // "Flow" appears as a separate word in both before and after, so the LCS
    // would normally treat it as equal context and truncate the correction to
    // "Whisperflow → Wispr". The fix folds it back into the run's after side.
    console.log(
      `  ratio("whisperflow", "wispr")      = ${ratio('whisperflow', 'wispr').toFixed(1)}% (truncated artifact)`
    )
    console.log(
      `  ratio("whisperflow", "wispr flow") = ${ratio('whisperflow', 'wispr flow').toFixed(1)}% (correct full form)`
    )
    const result = extractCorrections('Whisperflow Flow app', 'Wispr Flow app')
    expect(result).toEqual([
      { original: 'Whisperflow', corrected: 'Wispr Flow' },
    ])
  })

  test('learns a split lowercased phrase as an exact replacement candidate', () => {
    const result = extractCorrections(
      'please open whisper flow settings',
      'please open Wispr Flow settings'
    )
    expect(result).toEqual([
      { original: 'whisper flow', corrected: 'Wispr Flow' },
    ])
  })

  test('learns a split-word compound as a proper noun correction', () => {
    const result = extractCorrections(
      'please launch Open Claw now',
      'please launch OpenClaw now'
    )
    expect(result).toEqual([{ original: 'Open Claw', corrected: 'OpenClaw' }])
  })
})
