// Fuzzy string matching identical to RapidFuzz's fuzz.ratio():
//   score = 2 * lcs(s1, s2) / (|s1| + |s2|) * 100
// Uses Indel distance (insert/delete only, no substitution), not standard Levenshtein.

function lcsLength(s1: string, s2: string): number {
  const m = s1.length
  const n = s2.length
  if (m === 0 || n === 0) return 0
  // Use two rows to keep memory O(n)
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
  return (2 * lcsLength(s1, s2) / total) * 100
}

// Slides the shorter string across the longer, returns the best window ratio.
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

// Splits a transcript token into its leading/trailing punctuation and the word core.
function splitPunct(token: string): [string, string, string] {
  const leadMatch = token.match(/^([^\p{L}\p{N}]*)([\s\S]*)$/u)
  const lead = leadMatch ? leadMatch[1] : ''
  const rest = leadMatch ? leadMatch[2] : token
  const trailMatch = rest.match(/^([\s\S]*?)([^\p{L}\p{N}]*)$/u)
  const core = trailMatch ? trailMatch[1] : rest
  const trail = trailMatch ? trailMatch[2] : ''
  return [lead, core, trail]
}

export function applyDictionary(text: string, entries: string[]): string {
  if (entries.length === 0) return text

  const tokens = text.split(/(\s+)/)
  // tokens alternates between words and whitespace separators

  // Collect only the word positions (even or odd, depending on leading whitespace)
  const wordIdxs: number[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (!/^\s+$/.test(tokens[i]) && tokens[i].length > 0) wordIdxs.push(i)
  }

  for (const entry of entries) {
    const entryLower = entry.toLowerCase()
    const entryWords = entryLower.split(/\s+/)
    const isMultiWord = entryWords.length > 1

    if (!isMultiWord) {
      // Single-word entry: check individual tokens and collapsed bigrams
      for (let wi = 0; wi < wordIdxs.length; wi++) {
        const idx = wordIdxs[wi]
        const [lead, core, trail] = splitPunct(tokens[idx])
        if (core.length === 0) continue

        // Length guard: skip if lengths are too different
        const combinedLen = core.length + entry.length
        if (Math.abs(core.length - entry.length) / combinedLen > 0.4) {
          // Also try bigram collapse before giving up
          if (wi + 1 < wordIdxs.length) {
            const idx2 = wordIdxs[wi + 1]
            const [, core2] = splitPunct(tokens[idx2])
            const joined = (core + core2).toLowerCase()
            const joinedLen = joined.length + entry.length
            if (
              Math.abs(joined.length - entry.length) / joinedLen <= 0.4 &&
              ratio(joined, entryLower) >= THRESHOLD
            ) {
              // Replace the two tokens with the entry word, keep trailing punct of second
              const [, , trail2] = splitPunct(tokens[idx2])
              tokens[idx] = lead + entry + trail2
              // Remove the separator and second token
              const sepIdx = idx + 1
              const wordIdx2 = idx2
              tokens[sepIdx] = ''
              tokens[wordIdx2] = ''
              wordIdxs.splice(wi + 1, 1)
            }
          }
          continue
        }

        if (ratio(core.toLowerCase(), entryLower) >= THRESHOLD) {
          tokens[idx] = lead + entry + trail
          continue
        }

        // Bigram collapse check (current token + next word token)
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
            const sepIdx = idx + 1
            tokens[sepIdx] = ''
            tokens[idx2] = ''
            wordIdxs.splice(wi + 1, 1)
          }
        }
      }
    } else {
      // Multi-word entry: compare n-grams of matching word count
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
            tokens[idxs[j] - 1] = '' // wipe preceding separator
            tokens[idxs[j]] = ''
          }
          wordIdxs.splice(wi + 1, n - 1)
        }
      }
    }
  }

  return tokens.join('')
}
