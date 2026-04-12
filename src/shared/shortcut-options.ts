import { DICTATION_HOLD_QUALIFY_MS } from './dictation-shortcut'
import type { ShortcutId } from './types'

/** Used to group shortcuts in the picker (Option / Fn / Control). */
export type ShortcutFamily = 'option' | 'fn' | 'control'

export function shortcutFamily(id: ShortcutId): ShortcutFamily {
  if (id.startsWith('control-')) return 'control'
  if (id.startsWith('fn-')) return 'fn'
  return 'option'
}

/** Single source of truth for dictation shortcuts (picker UI + keyboard display). */
export interface ShortcutOption {
  id: ShortcutId
  keys: string[]
  label: string
}

export const SHORTCUT_OPTIONS: ShortcutOption[] = [
  { id: 'option-space', keys: ['⌥', 'Space'], label: 'Option + Space' },
  { id: 'right-option', keys: ['Right ⌥'], label: 'Right Option' },
  { id: 'option-enter', keys: ['⌥', 'Enter'], label: 'Option + Enter' },
  { id: 'fn-space', keys: ['Fn', 'Space'], label: 'Fn + Space' },
  { id: 'fn-f1', keys: ['Fn', 'F1'], label: 'Fn + F1' },
  { id: 'fn-f2', keys: ['Fn', 'F2'], label: 'Fn + F2' },
  {
    id: 'fn-globe',
    keys: ['Fn'],
    label: 'Fn only (Globe)',
  },
  { id: 'control-space', keys: ['⌃', 'Space'], label: 'Control + Space' },
  { id: 'control-enter', keys: ['⌃', 'Enter'], label: 'Control + Enter' },
]

/** Resolve a shortcut row for UI (falls back to first option if id is unknown). */
export function shortcutOptionById(id: ShortcutId): ShortcutOption {
  return SHORTCUT_OPTIONS.find((o) => o.id === id) ?? SHORTCUT_OPTIONS[0]
}

const FAMILY_ORDER: ShortcutFamily[] = ['option', 'fn', 'control']

const FAMILY_LABEL: Record<ShortcutFamily, string> = {
  option: 'Option (⌥)',
  fn: 'Fn / Globe',
  control: 'Control (⌃)',
}

export function shortcutOptionsGrouped(): {
  family: ShortcutFamily
  title: string
  options: ShortcutOption[]
}[] {
  const byFamily: Record<ShortcutFamily, ShortcutOption[]> = {
    option: [],
    fn: [],
    control: [],
  }
  for (const opt of SHORTCUT_OPTIONS) {
    byFamily[shortcutFamily(opt.id)].push(opt)
  }
  return FAMILY_ORDER.map((family) => ({
    family,
    title: FAMILY_LABEL[family],
    options: byFamily[family],
  }))
}

const keysById = Object.fromEntries(
  SHORTCUT_OPTIONS.map((o) => [o.id, o.keys])
) as Record<ShortcutId, string[]>

/** Key cap labels for a shortcut (for inline UI, e.g. Ready / onboarding). */
export function shortcutDisplayKeys(id: ShortcutId): string[] {
  return keysById[id] ?? SHORTCUT_OPTIONS[0].keys
}

/** Compact label for tray menu (Space → ␣; keys joined with +). */
export function shortcutTrayCompact(id: ShortcutId): string {
  return shortcutDisplayKeys(id).join('+')
}

/** Ready / onboarding: section title + body for hold-to-talk mode. */
export const dictationShortcutSummaryHoldTitle = 'Hold'

export const dictationShortcutSummaryHoldBody =
  'Keep the shortcut pressed while you talk, then release to paste.'

/** Ready / onboarding: section title + body for tap-to-latch mode. */
export const dictationShortcutSummaryTapTitle = 'Tap'

export const dictationShortcutSummaryTapBody =
  'Press once and let go, talk hands-free, then press the shortcut again to paste.'

/** Ready screen: sentence parts around underlined Hold / Tap hover terms. */
export const dictationReadyStartHintBeforeHold = 'To start dictating, use the '

export const dictationReadyStartHintBetween = ' or '

export const dictationReadyStartHintAfterTap =
  ' option with the main shortcut above.'

/** Ready screen: push-to-talk column — sentence parts around underlined Hold. */
export const dictationReadyPttHintBefore = 'This shortcut is '

export const dictationReadyPttHintAfter =
  ' only: keep it pressed while you talk, then release to paste.'

/** Full explanation for Settings (hold threshold + latch; see `DICTATION_HOLD_QUALIFY_MS`). */
export function dictationShortcutBehaviorHint(): string {
  const s = DICTATION_HOLD_QUALIFY_MS / 1000
  const dur = s >= 1 ? `${s} seconds` : `${DICTATION_HOLD_QUALIFY_MS} ms`
  return `Hold the shortcut about ${dur} while you speak, then release to stop recording and paste. To stay hands-free, tap quickly (press and release) to latch: when you are done, press the shortcut again to stop and paste.`
}

/** Explains optional second shortcut (push-to-talk only). */
export function dictationHoldOnlyShortcutHint(): string {
  return 'Optional second shortcut: always push-to-talk — release stops and pastes.'
}
