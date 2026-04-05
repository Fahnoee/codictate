import { join } from 'node:path'
import type { ShortcutId } from '../../../shared/types'
import {
  bindNativePasteboardWriter,
  unbindNativePasteboardWriter,
} from '../clipboard/native-pasteboard-bridge'
import { log } from '../logger'

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

export type StartKeyboardListenerOptions = {
  /** When false, KeyListener will not call CGRequestListenEventAccess() on launch (TCC refresh respawn). Default true. */
  requestListenAccessOnLaunch?: boolean
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

/** NSPasteboard + Cmd+V — Unicode-safe in bundled apps (no pbcopy / shell locale). */
let keyListenerPasteText: ((text: string) => void) | null = null

export function startKeyboardListener(
  onKeyDown: (event: KeyEvent) => void,
  swallowRules: KeyEvent[] = [],
  onPermissions?: (status: PermissionStatus) => void,
  options?: StartKeyboardListenerOptions
) {
  const binaryPath = join(import.meta.dir, '../native-helpers/KeyListener')
  const proc = Bun.spawn([binaryPath], { stdout: 'pipe', stdin: 'pipe' })
  let procAlive = true

  const requestListenAccessOnLaunch =
    options?.requestListenAccessOnLaunch !== false
  const config = JSON.stringify({
    swallow: swallowRules,
    requestListenAccessOnLaunch,
  })
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

  const pasteText = (text: string) => {
    proc.stdin.write(JSON.stringify({ command: 'paste_text', text }) + '\n')
    proc.stdin.flush()
  }

  const setClipboardOnly = (text: string) => {
    proc.stdin.write(JSON.stringify({ command: 'set_clipboard', text }) + '\n')
    proc.stdin.flush()
  }

  const checkPermissions = () => {
    proc.stdin.write(JSON.stringify({ command: 'check_permissions' }) + '\n')
    proc.stdin.flush()
  }

  const requestInputMonitoringPrompt = () => {
    proc.stdin.write(
      JSON.stringify({ command: 'request_input_monitoring' }) + '\n'
    )
    proc.stdin.flush()
  }

  const promptAccessibility = () => {
    proc.stdin.write(JSON.stringify({ command: 'prompt_accessibility' }) + '\n')
    proc.stdin.flush()
  }

  const requestMicrophone = () => {
    proc.stdin.write(JSON.stringify({ command: 'request_microphone' }) + '\n')
    proc.stdin.flush()
  }

  keyListenerPasteText = pasteText
  bindNativePasteboardWriter(setClipboardOnly)

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
          } else if (parsed.type === 'paste_result') {
            log('paste', 'CGEvent paste result from KeyListener', {
              success: parsed.success,
              accessibility: parsed.accessibility,
            })
          } else if (parsed.type === 'clipboard_set') {
            log('clipboard', 'NSPasteboard set (copy-only)')
          } else if (parsed.type === 'tap_attached') {
            console.log('[KeyListener] Event tap attached')
          } else if (parsed.type === 'tap_create_failed') {
            console.error(
              `[KeyListener] ${parsed.message ?? 'tap_create_failed'}`
            )
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
      keyListenerPasteText = null
      unbindNativePasteboardWriter()
      proc.kill()
    },
    checkPermissions,
    requestInputMonitoringPrompt,
    promptAccessibility,
    requestMicrophone,
  }
}

export const pasteTranscript = async (text: string) => {
  if (!keyListenerPasteText) {
    console.error(
      '[pasteTranscript] KeyListener not running; cannot paste transcript.'
    )
    return
  }
  log('paste', 'paste_text via KeyListener (NSPasteboard)', {
    charCount: text.length,
  })
  keyListenerPasteText(text)
}
