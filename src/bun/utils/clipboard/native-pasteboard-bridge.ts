/** KeyListener registers here so logger (and others) can set the pasteboard without importing keyboard-events. */

let writeFn: ((text: string) => void) | null = null

export function bindNativePasteboardWriter(fn: (text: string) => void) {
  writeFn = fn
}

export function unbindNativePasteboardWriter() {
  writeFn = null
}

/** Returns false if KeyListener has not started yet. */
export function writeNativePasteboard(text: string): boolean {
  if (!writeFn) return false
  writeFn(text)
  return true
}
