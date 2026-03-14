import { join } from 'node:path'
import type { ShortcutId } from '../../../shared/types'

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

export interface PermissionStatus {
  inputMonitoring: boolean
  microphone: boolean
  accessibility: boolean
}

export interface ShortcutDefinition {
  displayKeys: string[]
  swallowRule: KeyEvent
  isMatch: (e: KeyEvent) => boolean
}

export const SHORTCUTS: Record<ShortcutId, ShortcutDefinition> = {
  'option-space': {
    displayKeys: ['⌥', 'Space'],
    swallowRule: {
      keycode: Key.space,
      option: true,
      command: false,
      control: false,
      shift: false,
    },
    isMatch: (e) => e.keycode === Key.space && e.option,
  },
  'right-option': {
    displayKeys: ['Right ⌥'],
    swallowRule: {
      keycode: Key.rightOption,
      option: true,
      command: false,
      control: false,
      shift: false,
    },
    isMatch: (e) => e.keycode === Key.rightOption && e.option,
  },
  'option-f1': {
    displayKeys: ['⌥', 'F1'],
    swallowRule: {
      keycode: Key.f1,
      option: true,
      command: false,
      control: false,
      shift: false,
    },
    isMatch: (e) => e.keycode === Key.f1 && e.option,
  },
  'option-f2': {
    displayKeys: ['⌥', 'F2'],
    swallowRule: {
      keycode: Key.f2,
      option: true,
      command: false,
      control: false,
      shift: false,
    },
    isMatch: (e) => e.keycode === Key.f2 && e.option,
  },
  'option-enter': {
    displayKeys: ['⌥', 'Enter'],
    swallowRule: {
      keycode: Key.enter,
      option: true,
      command: false,
      control: false,
      shift: false,
    },
    isMatch: (e) => e.keycode === Key.enter && e.option,
  },
}

// Set when the keyboard listener starts so pasteToActiveWindow can use
// the already-trusted KeyListener process instead of osascript/System Events.
let keyListenerPaste: (() => void) | null = null

export function startKeyboardListener(
  onKeyDown: (event: KeyEvent) => void,
  swallowRules: KeyEvent[] = [],
  onPermissions?: (status: PermissionStatus) => void
) {
  const binaryPath = join(import.meta.dir, '../native-helpers/KeyListener')
  const proc = Bun.spawn([binaryPath], { stdout: 'pipe', stdin: 'pipe' })
  let procAlive = true

  const config = JSON.stringify({ swallow: swallowRules })
  proc.stdin.write(config + '\n')
  proc.stdin.flush()

  proc.exited.then((code) => {
    procAlive = false
    if (code !== 0) {
      console.error(
        `[KeyListener] exited with code ${code}.\n` +
          `If shortcuts are not working, grant Input Monitoring permission:\n` +
          `System Settings > Privacy & Security > Input Monitoring → add this app, then restart.`
      )
      onPermissions?.({
        inputMonitoring: false,
        microphone: false,
        accessibility: false,
      })
    }
  })

  const paste = () => {
    proc.stdin.write(JSON.stringify({ command: 'paste' }) + '\n')
    proc.stdin.flush()
  }

  const checkPermissions = () => {
    proc.stdin.write(JSON.stringify({ command: 'check_permissions' }) + '\n')
    proc.stdin.flush()
  }

  keyListenerPaste = paste

  const reader = proc.stdout.getReader()
  const decoder = new TextDecoder()

  ;(async () => {
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process every complete newline-terminated JSON line.
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)

          if (typeof parsed.keycode === 'number') {
            onKeyDown(parsed as KeyEvent)
          } else if (parsed.status === 'started') {
            onPermissions?.({
              inputMonitoring: parsed.inputMonitoring ?? false,
              microphone: parsed.microphone ?? false,
              accessibility: parsed.accessibility ?? false,
            })
          } else if (parsed.type === 'permissions') {
            onPermissions?.({
              inputMonitoring: parsed.inputMonitoring ?? false,
              microphone: parsed.microphone ?? false,
              accessibility: parsed.accessibility ?? false,
            })
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
    get isAlive() {
      return procAlive
    },
    stop: () => {
      keyListenerPaste = null
      proc.kill()
    },
    paste,
    checkPermissions,
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
