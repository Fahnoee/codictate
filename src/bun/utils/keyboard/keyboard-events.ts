import { join } from 'node:path'

export const KeyCode: Record<number, string> = {
  49: 'space',
  36: 'enter',
  53: 'escape',
  51: 'delete',
  48: 'tab',
  122: 'f1',
  120: 'f2',
  99: 'f3',
  118: 'f4',
  // modifiers
  56: 'shift',
  60: 'rightShift',
  55: 'command',
  54: 'rightCommand',
  58: 'option',
  61: 'rightOption',
  59: 'control',
  62: 'rightControl',
} as const

// Reverse lookup: name → keycode number (e.g. Key.space === 49)
export const Key = Object.fromEntries(
  Object.entries(KeyCode).map(([code, name]) => [name, Number(code)])
) as Record<string, number>

export interface KeyEvent {
  keycode: number
  option: boolean
  command: boolean
  control: boolean
  shift: boolean
}

// Set when the keyboard listener starts so pasteToActiveWindow can use
// the already-trusted KeyListener process instead of osascript/System Events.
let keyListenerPaste: (() => void) | null = null

export function startKeyboardListener(
  onKeyDown: (event: KeyEvent) => void,
  swallowRules: KeyEvent[] = []
) {
  const binaryPath = join(import.meta.dir, '../native-helpers/KeyListener')
  const proc = Bun.spawn([binaryPath], { stdout: 'pipe', stdin: 'pipe' })

  const config = JSON.stringify({ swallow: swallowRules })
  proc.stdin.write(config + '\n')
  proc.stdin.flush()

  // Warn if the process exits early (e.g. missing Input Monitoring permission)
  proc.exited.then((code) => {
    if (code !== 0) {
      console.error(
        `[KeyListener] exited with code ${code}.\n` +
          `If shortcuts are not working, grant Input Monitoring permission:\n` +
          `System Settings > Privacy & Security > Input Monitoring → add this app, then restart.`
      )
    }
  })

  const paste = () => {
    proc.stdin.write(JSON.stringify({ command: 'paste' }) + '\n')
    proc.stdin.flush()
  }

  keyListenerPaste = paste

  const reader = proc.stdout.getReader()
  const decoder = new TextDecoder()

  ;(async () => {
    // Buffer for incomplete lines — a single read() chunk can contain multiple
    // JSON objects or a partial object split across two chunks.
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process every complete newline-terminated JSON line.
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // keep any trailing incomplete line

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          if (typeof parsed.keycode === 'number') {
            onKeyDown(parsed as KeyEvent)
          } else if (
            parsed.status === 'permission_requested' ||
            parsed.status === 'error'
          ) {
            console.error(`[KeyListener] ${parsed.message ?? parsed.status}`)
          }
        } catch {
          // Ignore malformed output lines from the native binary
        }
      }
    }
  })()

  return {
    stop: () => {
      keyListenerPaste = null
      proc.kill()
    },
    paste,
  }
}

export const copyToClipboard = async (text: string) => {
  const proc = Bun.spawn(['pbcopy'], { stdin: 'pipe' })
  proc.stdin.write(text)
  await proc.stdin.end()
  await proc.exited
}

// Uses the KeyListener's CGEvent-based paste if available (no System Events
// permission needed). Falls back to osascript only if the listener isn't running.
export const pasteToActiveWindow = async () => {
  if (keyListenerPaste) {
    keyListenerPaste()
    return
  }

  // Fallback: requires Automation > System Events permission
  const proc = Bun.spawn(
    [
      'osascript',
      '-e',
      'tell application "System Events" to keystroke "v" using command down',
    ],
    { stderr: 'pipe', stdout: 'pipe' }
  )
  await proc.exited
}
