// Fuzzy string matching identical to RapidFuzz's fuzz.ratio():
//   score = 2 * lcs(s1, s2) / (|s1| + |s2|) * 100
// Uses Indel distance (insert/delete only, no substitution), not standard Levenshtein.

import type { DictionaryEntry } from '../../../shared/types'

function lcsLength(s1: string, s2: string): number {
  const m = s1.length
  const n = s2.length
  if (m === 0 || n === 0) return 0
  let prev = new Array<number>(n + 1).fill(0)
  let curr = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      curr[j] =
        s1[i - 1] === s2[j - 1]
          ? prev[j - 1] + 1
          : Math.max(prev[j], curr[j - 1])
    }
    ;[prev, curr] = [curr, prev]
    curr.fill(0)
  }
  return prev[n]
}

export function ratio(s1: string, s2: string): number {
  const total = s1.length + s2.length
  if (total === 0) return 100
  return ((2 * lcsLength(s1, s2)) / total) * 100
}

export function partialRatio(s1: string, s2: string): number {
  if (s1.length === 0 || s2.length === 0) return 0
  const [shorter, longer] = s1.length <= s2.length ? [s1, s2] : [s2, s1]
  if (shorter.length === longer.length) return ratio(shorter, longer)
  let best = 0
  for (let i = 0; i <= longer.length - shorter.length; i++) {
    const score = ratio(shorter, longer.slice(i, i + shorter.length))
    if (score > best) best = score
    if (best === 100) break
  }
  return best
}

const THRESHOLD = 85

function splitPunct(token: string): [string, string, string] {
  const leadMatch = token.match(/^([^\p{L}\p{N}]*)([\s\S]*)$/u)
  const lead = leadMatch ? leadMatch[1] : ''
  const rest = leadMatch ? leadMatch[2] : token
  const trailMatch = rest.match(/^([\s\S]*?)([^\p{L}\p{N}]*)$/u)
  const core = trailMatch ? trailMatch[1] : rest
  const trail = trailMatch ? trailMatch[2] : ''
  return [lead, core, trail]
}

export function applyDictionary(
  text: string,
  entries: DictionaryEntry[]
): string {
  if (entries.length === 0) return text

  const tokens = text.split(/(\s+)/)
  const wordIdxs: number[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (!/^\s+$/.test(tokens[i]) && tokens[i].length > 0) wordIdxs.push(i)
  }

  for (const entry of entries.filter((item) => item.kind === 'replacement')) {
    const fromWords = entry.from!.toLowerCase().split(/\s+/)
    const replacement = entry.text
    const n = fromWords.length

    for (let wi = 0; wi + n - 1 < wordIdxs.length; wi++) {
      const idxs = wordIdxs.slice(wi, wi + n)
      const [lead] = splitPunct(tokens[idxs[0]])
      const [, , trailLast] = splitPunct(tokens[idxs[n - 1]])
      const phrase = idxs
        .map((i) => splitPunct(tokens[i])[1].toLowerCase())
        .join(' ')

      if (phrase !== fromWords.join(' ')) continue

      tokens[idxs[0]] = lead + replacement + trailLast
      for (let j = 1; j < n; j++) {
        tokens[idxs[j] - 1] = ''
        tokens[idxs[j]] = ''
      }
      wordIdxs.splice(wi + 1, n - 1)
    }
  }

  for (const { text: entry } of entries.filter(
    (item) => item.kind === 'fuzzy'
  )) {
    const entryLower = entry.toLowerCase()
    const entryWords = entryLower.split(/\s+/)
    const isMultiWord = entryWords.length > 1

    if (!isMultiWord) {
      for (let wi = 0; wi < wordIdxs.length; wi++) {
        const idx = wordIdxs[wi]
        const [lead, core, trail] = splitPunct(tokens[idx])
        if (core.length === 0) continue

        const combinedLen = core.length + entry.length
        if (Math.abs(core.length - entry.length) / combinedLen > 0.4) {
          if (wi + 1 < wordIdxs.length) {
            const idx2 = wordIdxs[wi + 1]
            const [, core2] = splitPunct(tokens[idx2])
            const joined = (core + core2).toLowerCase()
            const joinedLen = joined.length + entry.length
            if (
              Math.abs(joined.length - entry.length) / joinedLen <= 0.4 &&
              ratio(joined, entryLower) >= THRESHOLD
            ) {
              const [, , trail2] = splitPunct(tokens[idx2])
              tokens[idx] = lead + entry + trail2
              tokens[idx + 1] = ''
              tokens[idx2] = ''
              wordIdxs.splice(wi + 1, 1)
            }
          }
          continue
        }

        if (ratio(core.toLowerCase(), entryLower) >= THRESHOLD) {
          tokens[idx] = lead + entry + trail
          continue
        }

        if (wi + 1 < wordIdxs.length) {
          const idx2 = wordIdxs[wi + 1]
          const [, core2] = splitPunct(tokens[idx2])
          const joined = (core + core2).toLowerCase()
          const joinedLen = joined.length + entry.length
          if (
            Math.abs(joined.length - entry.length) / joinedLen <= 0.4 &&
            ratio(joined, entryLower) >= THRESHOLD
          ) {
            const [, , trail2] = splitPunct(tokens[idx2])
            tokens[idx] = lead + entry + trail2
            tokens[idx + 1] = ''
            tokens[idx2] = ''
            wordIdxs.splice(wi + 1, 1)
          }
        }
      }
    } else {
      const n = entryWords.length
      for (let wi = 0; wi + n - 1 < wordIdxs.length; wi++) {
        const idxs = wordIdxs.slice(wi, wi + n)
        const [lead] = splitPunct(tokens[idxs[0]])
        const [, , trailLast] = splitPunct(tokens[idxs[n - 1]])
        const ngram = idxs
          .map((i) => splitPunct(tokens[i])[1].toLowerCase())
          .join(' ')
        if (ratio(ngram, entryLower) >= THRESHOLD) {
          tokens[idxs[0]] = lead + entry + trailLast
          for (let j = 1; j < n; j++) {
            tokens[idxs[j] - 1] = ''
            tokens[idxs[j]] = ''
          }
          wordIdxs.splice(wi + 1, n - 1)
        }
      }
    }
  }

  return tokens.join('')
}

// ── Auto-learning: extract correction candidates from a before/after diff ──

export interface CorrectionCandidate {
  original: string
  corrected: string
}

function tokenizeWords(text: string): string[] {
  return text.match(/\S+/g) ?? []
}

interface WordEditRun {
  before: string[]
  after: string[]
}

function normalizeCore(token: string): string {
  return token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

// Word-level LCS diff grouped into contiguous edit runs.
function wordEditRuns(before: string[], after: string[]): WordEditRun[] {
  const m = before.length
  const n = after.length
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        before[i - 1] === after[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  const ops: Array<
    | { type: 'equal'; word: string }
    | { type: 'delete'; word: string }
    | { type: 'insert'; word: string }
  > = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && before[i - 1] === after[j - 1]) {
      ops.push({ type: 'equal', word: before[i - 1] })
      i--
      j--
    } else if (i > 0 && (j === 0 || dp[i - 1][j] >= dp[i][j - 1])) {
      ops.push({ type: 'delete', word: before[i - 1] })
      i--
    } else {
      ops.push({ type: 'insert', word: after[j - 1] })
      j--
    }
  }
  ops.reverse()

  const runs: WordEditRun[] = []
  let current: WordEditRun | null = null

  for (const op of ops) {
    if (op.type === 'equal') {
      // When an edit run ends with an adjacent capitalized word being treated
      // as equal context (LCS greedily matching it), check whether folding it
      // into the run's after side actually improves similarity. If so, absorb
      // it — e.g. "Whisperflow" → "Wispr" + equal("Flow") becomes
      // "Whisperflow" → "Wispr Flow" instead of the truncated form.
      if (
        current &&
        current.before.length === 1 &&
        current.after.length >= 1 &&
        current.after.length < 3 &&
        /^[A-Z]/.test(op.word)
      ) {
        const origCore = normalizeCore(current.before[0])
        const currJoined = current.after
          .map(normalizeCore)
          .filter(Boolean)
          .join(' ')
        const extJoined = [currJoined, normalizeCore(op.word)]
          .filter(Boolean)
          .join(' ')
        if (
          ratio(origCore.toLowerCase(), extJoined.toLowerCase()) >
          ratio(origCore.toLowerCase(), currJoined.toLowerCase())
        ) {
          current.after.push(op.word)
          continue
        }
      }
      if (current && (current.before.length > 0 || current.after.length > 0)) {
        runs.push(current)
      }
      current = null
      continue
    }

    if (!current) current = { before: [], after: [] }
    if (op.type === 'delete') current.before.push(op.word)
    else current.after.push(op.word)
  }

  if (current && (current.before.length > 0 || current.after.length > 0)) {
    runs.push(current)
  }

  return runs
}

export function extractCorrections(
  snapshotBefore: string,
  snapshotAfter: string
): CorrectionCandidate[] {
  if (snapshotBefore === snapshotAfter) return []

  const wordsBefore = tokenizeWords(snapshotBefore)
  const wordsAfter = tokenizeWords(snapshotAfter)
  const runs = wordEditRuns(wordsBefore, wordsAfter)
  const totalChangedWords = runs.reduce(
    (count, run) => count + Math.max(run.before.length, run.after.length),
    0
  )

  const candidates: CorrectionCandidate[] = []

  for (const run of runs) {
    if (run.after.length === 0 || run.after.length > 3) continue

    const corrCore = run.after.map(normalizeCore).filter(Boolean).join(' ')
    if (corrCore.length < 2) continue

    const hasCapital = /[A-Z]/.test(corrCore)
    if (!hasCapital) continue

    if (run.before.length === 0) continue

    const origCore =
      run.before.length === 1
        ? normalizeCore(run.before[0])
        : run.before.map(normalizeCore).filter(Boolean).join(' ')
    if (origCore.length === 0) continue

    // Case-only correction (e.g. "whisperflow" → "WhisperFlow")
    if (origCore.toLowerCase() === corrCore.toLowerCase()) {
      if (origCore !== corrCore) {
        candidates.push({ original: origCore, corrected: corrCore })
      }
      continue
    }

    // High character similarity — looks like a mishearing
    if (ratio(origCore.toLowerCase(), corrCore.toLowerCase()) >= 65) {
      candidates.push({ original: origCore, corrected: corrCore })
      continue
    }

    // If the user corrected exactly one capitalized word in the whole field,
    // prefer learning it even when the misspelling is phonetically distant.
    if (run.before.length === 1 && totalChangedWords === 1) {
      candidates.push({ original: origCore, corrected: corrCore })
    }
  }

  return candidates
}
