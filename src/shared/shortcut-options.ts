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
  { id: 'option-f1', keys: ['⌥', 'F1'], label: 'Option + F1' },
  { id: 'option-f2', keys: ['⌥', 'F2'], label: 'Option + F2' },
  { id: 'option-enter', keys: ['⌥', 'Enter'], label: 'Option + Enter' },
  { id: 'fn-space', keys: ['Fn', 'Space'], label: 'Fn + Space' },
  { id: 'fn-f1', keys: ['Fn', 'F1'], label: 'Fn + F1' },
  { id: 'fn-f2', keys: ['Fn', 'F2'], label: 'Fn + F2' },
  { id: 'fn-enter', keys: ['Fn', 'Enter'], label: 'Fn + Enter' },
  {
    id: 'fn-globe',
    keys: ['Fn'],
    label: 'Fn only (Globe)',
  },
  { id: 'control-space', keys: ['⌃', 'Space'], label: 'Control + Space' },
  { id: 'control-f1', keys: ['⌃', 'F1'], label: 'Control + F1' },
  { id: 'control-f2', keys: ['⌃', 'F2'], label: 'Control + F2' },
  { id: 'control-enter', keys: ['⌃', 'Enter'], label: 'Control + Enter' },
]

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

/** Explains automatic hold vs tap-to-latch (see `DICTATION_HOLD_QUALIFY_MS`). */
export function dictationShortcutBehaviorHint(): string {
  const s = DICTATION_HOLD_QUALIFY_MS / 1000
  const dur = s >= 1 ? `${s} seconds` : `${DICTATION_HOLD_QUALIFY_MS} ms`
  return `Hold the shortcut about ${dur}, then release to stop and paste. Tap quickly (press and release) to latch: press again to stop and paste.`
}
