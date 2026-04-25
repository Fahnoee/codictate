import type { FormattingEmailClosingStyle, FormattingEmailGreetingStyle } from '../../../shared/types'
import type { FormattedEmail } from './schemas'

const CLOSING_MARKERS = [
  { text: 'best regards', language: 'en' },
  { text: 'kind regards', language: 'en' },
  { text: 'regards', language: 'en' },
  { text: 'thanks', language: 'en' },
  { text: 'thank you', language: 'en' },
  { text: 'sincerely', language: 'en' },
  { text: 'cheers', language: 'en' },
  { text: 'med venlig hilsen', language: 'da' },
  { text: 'venlig hilsen', language: 'da' },
  { text: 'mvh', language: 'da' },
  { text: 'bedste hilsner', language: 'da' },
  { text: 'saludos', language: 'es' },
  { text: 'saludos cordiales', language: 'es' },
  { text: 'muchas gracias', language: 'es' },
  { text: 'gracias', language: 'es' },
] as const

const GREETING_MARKERS = [
  { text: 'hi', language: 'en' },
  { text: 'hello', language: 'en' },
  { text: 'hey', language: 'en' },
  { text: 'dear', language: 'en' },
  { text: 'hej', language: 'da' },
  { text: 'hejsa', language: 'da' },
  { text: 'kære', language: 'da' },
  { text: 'hola', language: 'es' },
  { text: 'buenas', language: 'es' },
  { text: 'bonjour', language: 'fr' },
] as const

function stripEnvelopeNoise(text: string): string {
  return text
    .replace(/[{}[\]`<>]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function cleanBody(text: string): string {
  return stripEnvelopeNoise(text)
    .replace(/ ([,.:!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function capitaliseFirst(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  return trimmed.replace(/^\p{Ll}/u, (char) => char.toLocaleUpperCase())
}

function splitLeadingSentence(text: string): { first: string; rest: string } {
  const trimmed = text.trim()
  if (!trimmed) return { first: '', rest: '' }

  const match = trimmed.match(/^(.+?[.!?])(\s+|$)/s)
  if (match) {
    const first = match[1].trim()
    const rest = trimmed.slice(match[0].length).trim()
    return { first, rest }
  }

  return { first: '', rest: trimmed }
}

function splitLeadingClause(text: string): { first: string; rest: string } {
  const trimmed = text.trim()
  if (!trimmed) return { first: '', rest: '' }

  const commaIndex = trimmed.indexOf(',')
  if (commaIndex < 0) return { first: '', rest: trimmed }

  const first = trimmed.slice(0, commaIndex).trim()
  const rest = trimmed.slice(commaIndex + 1).trim()
  return { first, rest }
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function firstWords(text: string, limit = 5): string {
  return fold(text).split(/\s+/).filter(Boolean).slice(0, limit).join(' ')
}

function looksLikeClosing(text: string): boolean {
  const start = firstWords(text)
  return CLOSING_MARKERS.some((marker) => start.startsWith(marker.text))
}

function looksLikeGreeting(text: string): boolean {
  const start = firstWords(text)
  return GREETING_MARKERS.some((marker) => start.startsWith(marker.text))
}

function detectTemplateLanguage(
  text: string,
  markers: readonly { text: string; language: string }[]
): string | '' {
  const start = firstWords(text)
  const match = markers.find((marker) => start.startsWith(marker.text))
  return match?.language ?? ''
}

function wasSpokenInTranscript(text: string, originalTranscript: string): boolean {
  const candidate = fold(text)
  const transcript = fold(originalTranscript)
  if (!candidate || !transcript) return false
  return transcript.includes(candidate)
}

function isSpokenGreetingSentence(text: string): boolean {
  const trimmed = stripEnvelopeNoise(text)
  if (!trimmed || !looksLikeGreeting(trimmed)) return false
  const wordCount = fold(trimmed).split(/\s+/).filter(Boolean).length
  return wordCount > 0 && wordCount <= 6
}

function isPureGreetingText(text: string): boolean {
  const cleaned = stripEnvelopeNoise(text)
  if (!cleaned || !looksLikeGreeting(cleaned)) return false
  const wordCount = fold(cleaned).split(/\s+/).filter(Boolean).length
  if (wordCount > 4) return false
  const commaCount = (cleaned.match(/,/g) ?? []).length
  if (commaCount > 1) return false
  return !/[.!?]/.test(cleaned)
}

function extractGreetingFromBodyStart(text: string): {
  greeting: string
  body: string
} {
  const cleaned = cleanBody(text)
  if (!cleaned) return { greeting: '', body: '' }

  const { first: leadingSentence, rest: remainingAfterSentence } =
    splitLeadingSentence(cleaned)
  if (isSpokenGreetingSentence(leadingSentence)) {
    return {
      greeting: leadingSentence,
      body: capitaliseFirst(remainingAfterSentence),
    }
  }

  const { first: leadingClause, rest: remainingAfterClause } =
    splitLeadingClause(cleaned)
  if (isSpokenGreetingSentence(leadingClause)) {
    return {
      greeting: leadingClause,
      body: capitaliseFirst(remainingAfterClause),
    }
  }

  return { greeting: '', body: cleaned }
}

function stripSenderNameFromGreeting(
  greeting: string,
  userDisplayName: string,
  originalTranscript: string
): string {
  const cleaned = stripEnvelopeNoise(greeting)
  if (!cleaned || !userDisplayName.trim()) return cleaned

  const foldedGreeting = fold(cleaned)
  const foldedName = fold(userDisplayName)
  const foldedTranscriptStart = fold(originalTranscript.slice(0, 120))

  if (!foldedGreeting.includes(foldedName)) return cleaned
  if (foldedTranscriptStart.includes(foldedName)) return cleaned

  const namePattern = new RegExp(userDisplayName.trim().replace(/\s+/g, '\\s+'), 'i')
  return cleaned
    .replace(namePattern, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/ ([,!?.])/g, '$1')
    .trim()
}

function stripSenderNameFromClosing(closing: string, senderName: string): string {
  const cleaned = stripEnvelopeNoise(closing)
  if (!cleaned || !senderName.trim()) return cleaned

  const escaped = senderName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return cleaned
    .replace(new RegExp(`[,\\s-]*${escaped}\\s*$`, 'i'), '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function withTrailingComma(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  const last = trimmed.slice(-1)
  if (',!?'.includes(last)) return trimmed
  if ('.;:'.includes(last)) return trimmed.slice(0, -1) + ','
  return trimmed + ','
}

function normaliseLanguage(language: string, transcriptionLanguage: string): string {
  const explicit = transcriptionLanguage === 'auto' ? '' : transcriptionLanguage
  const source = explicit || language || 'en'
  return source.split('-')[0].toLowerCase()
}

function defaultGreeting(style: FormattingEmailGreetingStyle, language: string): string {
  if (style === 'none') return ''
  if (style === 'custom') return ''
  if (language === 'da') {
    if (style === 'hello') return 'Hej'
    return 'Hej'
  }
  if (language === 'es') {
    return 'Hola'
  }
  if (style === 'hello') return 'Hello'
  if (style === 'hi') return 'Hi'
  return language === 'en' ? 'Hi' : ''
}

function defaultClosing(style: FormattingEmailClosingStyle, language: string): string {
  if (style === 'none') return ''
  if (style === 'custom') return ''
  if (language === 'da') {
    if (style === 'thanks') return 'Tak'
    if (style === 'kind-regards' || style === 'best-regards' || style === 'auto') {
      return 'Med venlig hilsen'
    }
    return ''
  }
  if (language === 'es') {
    if (style === 'thanks') return 'Gracias'
    if (style === 'kind-regards') return 'Saludos cordiales'
    if (style === 'best-regards' || style === 'auto') return 'Saludos'
    return ''
  }
  if (style === 'thanks') return 'Thanks'
  if (style === 'kind-regards') return 'Kind regards'
  if (style === 'best-regards' || style === 'auto') return 'Best regards'
  return ''
}

function pickGreeting(
  greeting: string,
  closing: string,
  opts: {
    greetingStyle: FormattingEmailGreetingStyle
    customGreeting: string
    language: string
    originalTranscript: string
  }
): string {
  if (opts.greetingStyle === 'none') return ''

  let candidate = stripEnvelopeNoise(greeting)
  if (!candidate && looksLikeGreeting(closing)) {
    candidate = stripEnvelopeNoise(closing)
  }
  if (candidate && looksLikeClosing(candidate) && !looksLikeGreeting(candidate)) {
    candidate = ''
  }
  const candidateLanguage = detectTemplateLanguage(candidate, GREETING_MARKERS)
  if (
    candidate &&
    candidateLanguage &&
    candidateLanguage !== opts.language &&
    !wasSpokenInTranscript(candidate, opts.originalTranscript)
  ) {
    candidate = ''
  }
  if (candidate) return withTrailingComma(candidate)

  if (opts.greetingStyle === 'custom' && opts.customGreeting.trim()) {
    return withTrailingComma(opts.customGreeting.trim())
  }

  return withTrailingComma(defaultGreeting(opts.greetingStyle, opts.language))
}

function pickClosing(
  greeting: string,
  closing: string,
  opts: {
    closingStyle: FormattingEmailClosingStyle
    customClosing: string
    language: string
    originalTranscript: string
  }
): string {
  if (opts.closingStyle === 'none') return ''

  let candidate = stripEnvelopeNoise(closing)
  if (!candidate && looksLikeClosing(greeting)) {
    candidate = stripEnvelopeNoise(greeting)
  }
  if (candidate && looksLikeGreeting(candidate) && !looksLikeClosing(candidate)) {
    candidate = ''
  }
  const candidateLanguage = detectTemplateLanguage(candidate, CLOSING_MARKERS)
  if (
    candidate &&
    candidateLanguage &&
    candidateLanguage !== opts.language &&
    !wasSpokenInTranscript(candidate, opts.originalTranscript)
  ) {
    candidate = ''
  }
  if (candidate) return withTrailingComma(candidate)

  if (opts.closingStyle === 'custom' && opts.customClosing.trim()) {
    return withTrailingComma(opts.customClosing.trim())
  }

  return withTrailingComma(defaultClosing(opts.closingStyle, opts.language))
}

export function assembleEmail(
  email: FormattedEmail,
  opts: {
    senderNameOverride?: string
    userDisplayName?: string
    originalTranscript?: string
    transcriptionLanguage?: string
    greetingStyle: FormattingEmailGreetingStyle
    closingStyle: FormattingEmailClosingStyle
    customGreeting: string
    customClosing: string
  }
): string {
  const originalTranscript = opts.originalTranscript ?? ''
  const senderName = opts.senderNameOverride?.trim() ?? ''
  const language = normaliseLanguage(
    email.language,
    opts.transcriptionLanguage ?? 'auto'
  )

  const cleanedGreeting = stripSenderNameFromGreeting(
    email.greeting,
    opts.userDisplayName ?? '',
    originalTranscript
  )
  const cleanedClosing = stripSenderNameFromClosing(email.closing, senderName)
  const cleanedBody = cleanBody(email.body)
  const greetingLooksLikeClosingOnly =
    cleanedGreeting &&
    looksLikeClosing(cleanedGreeting) &&
    !looksLikeGreeting(cleanedGreeting)
  const greetingLooksLikeBody =
    cleanedGreeting && !greetingLooksLikeClosingOnly && !isPureGreetingText(cleanedGreeting)
  const bodySource = greetingLooksLikeBody
    ? [cleanedGreeting, cleanedBody].filter(Boolean).join(' ')
    : cleanedBody
  const greetingSourceField = greetingLooksLikeBody ? '' : cleanedGreeting
  const { greeting: bodyGreeting, body } = extractGreetingFromBodyStart(
    bodySource
  )

  const greetingSource =
    greetingSourceField &&
    !looksLikeGreeting(greetingSourceField) &&
    bodyGreeting
      ? bodyGreeting
      : bodyGreeting || greetingSourceField

  const greeting = pickGreeting(greetingSource, cleanedClosing, {
    greetingStyle: opts.greetingStyle,
    customGreeting: opts.customGreeting,
    language,
    originalTranscript,
  })
  const closing = pickClosing(cleanedGreeting, cleanedClosing, {
    closingStyle: opts.closingStyle,
    customClosing: opts.customClosing,
    language,
    originalTranscript,
  })

  const parts: string[] = []
  if (greeting) parts.push(greeting)
  if (body) {
    parts.push('')
    parts.push(body)
  }
  if (closing) {
    parts.push('')
    parts.push(closing)
  }
  if (senderName) parts.push(senderName)

  return parts.join('\n').trim() || originalTranscript
}
