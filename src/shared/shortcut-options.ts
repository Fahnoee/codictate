import type { ShortcutId } from './types'

/** Single source of truth for dictation shortcuts (picker UI + keyboard display). */
export interface ShortcutOption {
  id: ShortcutId
  keys: string[]
  label: string
}

export const SHORTCUT_OPTIONS: ShortcutOption[] = [
  { id: 'option-space', keys: ['⌥', 'Space'], label: 'Option + Space' },
  { id: 'right-option', keys: ['Right ⌥'], label: 'Right Option key' },
  { id: 'option-f1', keys: ['⌥', 'F1'], label: 'Option + F1' },
  { id: 'option-f2', keys: ['⌥', 'F2'], label: 'Option + F2' },
  { id: 'option-enter', keys: ['⌥', 'Enter'], label: 'Option + Enter' },
]

const keysById = Object.fromEntries(
  SHORTCUT_OPTIONS.map((o) => [o.id, o.keys])
) as Record<ShortcutId, string[]>

/** Key cap labels for a shortcut (for inline UI, e.g. Ready / onboarding). */
export function shortcutDisplayKeys(id: ShortcutId): string[] {
  return keysById[id] ?? SHORTCUT_OPTIONS[0].keys
}
