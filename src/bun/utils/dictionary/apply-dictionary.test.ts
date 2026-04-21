import { describe, expect, test } from 'bun:test'
import { applyDictionary, extractCorrections } from './apply-dictionary'

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
})

describe('extractCorrections', () => {
  test('learns a corrected proper noun even when similarity is low', () => {
    expect(
      extractCorrections(
        "This is a test of my girlfriend's name, Ollie's.",
        "This is a test of my girlfriend's name, Aliz."
      )
    ).toEqual([{ original: "Ollie's", corrected: 'Aliz' }])
  })

  test('learns case-only proper noun corrections', () => {
    expect(
      extractCorrections(
        'please email whisperflow tomorrow',
        'please email WhisperFlow tomorrow'
      )
    ).toEqual([{ original: 'whisperflow', corrected: 'WhisperFlow' }])
  })

  test('does not learn lowercase grammar edits', () => {
    expect(extractCorrections('this are fine', 'this is fine')).toEqual([])
  })
})
