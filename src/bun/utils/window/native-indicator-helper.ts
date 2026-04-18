import { existsSync } from 'fs'
import { join } from 'path'
import type { AppStatus } from '../../../shared/types'

type MoveEvent = { type: 'move'; x?: number; y?: number }

const CANDIDATE_PATHS = [
  join(import.meta.dir, '../native-helpers/CodictateWindowHelper'),
  join(process.cwd(), 'vendors/window-helper/CodictateWindowHelper'),
]

function findHelperPath(): string | null {
  for (const path of CANDIDATE_PATHS) {
    if (existsSync(path)) {
      return path
    }
  }
  console.log(
    '[Codictate] CodictateWindowHelper not found — native indicator helper unavailable.\n' +
      '  Run `bun run build:native` to compile the native helper.'
  )
  return null
}

function statusToWire(
  status: AppStatus
): 'ready' | 'recording' | 'transcribing' {
  switch (status) {
    case 'recording':
      return 'recording'
    case 'transcribing':
      return 'transcribing'
    default:
      return 'ready'
  }
}

export type NativeIndicatorHelper = {
  show: (
    frame: { x: number; y: number; width: number; height: number },
    status: AppStatus
  ) => void
  hide: () => void
  setStatus: (status: AppStatus) => void
  dispose: () => void
}

export function createNativeIndicatorHelper(
  onMove?: (x: number, y: number) => void
): NativeIndicatorHelper | null {
  const helperPath = findHelperPath()
  if (!helperPath) return null

  const proc = Bun.spawn([helperPath], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'inherit',
  })

  const reader = proc.stdout.getReader()
  void (async () => {
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line !== '') {
          try {
            const event = JSON.parse(line) as MoveEvent
            if (
              event.type === 'move' &&
              typeof event.x === 'number' &&
              typeof event.y === 'number'
            ) {
              onMove?.(event.x, event.y)
            }
          } catch {
            /* ignore non-protocol stdout */
          }
        }
        newlineIndex = buffer.indexOf('\n')
      }
    }
  })()

  function send(command: Record<string, unknown>) {
    proc.stdin.write(JSON.stringify(command) + '\n')
    proc.stdin.flush()
  }

  return {
    show(frame, status) {
      send({ command: 'show', ...frame, status: statusToWire(status) })
    },
    hide() {
      send({ command: 'hide' })
    },
    setStatus(status) {
      send({ command: 'status', status: statusToWire(status) })
    },
    dispose() {
      try {
        send({ command: 'quit' })
      } catch {
        /* already gone */
      }
    },
  }
}
