/** Shortcut held at least this long → release ends recording; shorter tap+release → second press ends. */
export const DICTATION_HOLD_QUALIFY_MS = 250

/**
 * When main is ⌥+key and push-to-talk is Right ⌥ alone, defer PTT start this long so the
 * chord (e.g. Right ⌥ then Space) can start hybrid instead of stealing the sequence.
 */
export const RIGHT_OPTION_PTT_DEFER_MS = 90
