import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const soundPath = (filename: string) =>
  join(import.meta.dir, `../sounds/${filename}`)

const DICTATION_START_WAV = soundPath('dictation-start.wav')
/** Extra ms after measured WAV length before MicRecorder lowers system volume. */
const DUCK_AFTER_CHIME_PAD_MS = 28
const FALLBACK_CHIME_MS = 220

let cachedDuckDelayMs: number | null = null

function parseWavDurationMs(buf: Buffer): number | null {
  if (buf.length < 44) return null
  if (buf.subarray(0, 4).toString('ascii') !== 'RIFF') return null
  if (buf.subarray(8, 12).toString('ascii') !== 'WAVE') return null
  let off = 12
  let sampleRate = 0
  let channels = 0
  let bitsPerSample = 0
  let dataSize = 0
  while (off + 8 <= buf.length) {
    const chunkId = buf.subarray(off, off + 4).toString('ascii')
    const chunkSize = buf.readUInt32LE(off + 4)
    const dataStart = off + 8
    off += 8 + chunkSize + (chunkSize % 2)
    if (chunkId === 'fmt ') {
      if (dataStart + 18 > buf.length) return null
      channels = buf.readUInt16LE(dataStart + 2)
      sampleRate = buf.readUInt32LE(dataStart + 4)
      bitsPerSample = buf.readUInt16LE(dataStart + 14)
    } else if (chunkId === 'data') {
      dataSize = chunkSize
      break
    }
  }
  if (!sampleRate || !channels || !bitsPerSample || !dataSize) return null
  const bytesPerSample = bitsPerSample / 8
  if (bytesPerSample <= 0 || !Number.isInteger(bytesPerSample)) return null
  const bytesPerFrame = channels * bytesPerSample
  if (!bytesPerFrame) return null
  const frames = dataSize / bytesPerFrame
  if (!Number.isFinite(frames) || frames <= 0) return null
  return (frames / sampleRate) * 1000
}

/**
 * Delay before MicRecorder ducks system output: matches `dictation-start.wav` length + pad.
 * Cached after first read so spawn stays cheap. Does not block recording startup.
 */
export function duckDelayAfterStartChimeMs(): number {
  if (cachedDuckDelayMs !== null) return cachedDuckDelayMs
  let baseMs = FALLBACK_CHIME_MS
  if (existsSync(DICTATION_START_WAV)) {
    try {
      const ms = parseWavDurationMs(readFileSync(DICTATION_START_WAV))
      if (ms != null && ms > 0 && ms < 30_000) baseMs = Math.ceil(ms)
    } catch {
      // keep fallback
    }
  }
  cachedDuckDelayMs = Math.min(10_000, baseMs + DUCK_AFTER_CHIME_PAD_MS)
  return cachedDuckDelayMs
}

// Fire-and-forget — does not block the caller
export const playStartSound = () => {
  // TODO: ADD fun mode
  // Bun.spawn(['afplay', soundPath('start.mp3')])
  Bun.spawn(['afplay', DICTATION_START_WAV])
}

export const playEndSound = () => {
  // TODO: ADD fun mode
  // Bun.spawn(['afplay', soundPath('end.mp3')])
  Bun.spawn(['afplay', soundPath('dictation-stop.wav')])
}
