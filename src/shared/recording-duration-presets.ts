/** Auto-stop presets: 2–7 minutes, plus 15 and 30 minutes, in seconds. */
export const RECORDING_DURATION_PRESET_SECONDS = [
  120, 180, 240, 300, 360, 420, 900, 1800,
] as const

export type RecordingDurationPresetSeconds =
  (typeof RECORDING_DURATION_PRESET_SECONDS)[number]

export const DEFAULT_MAX_RECORDING_DURATION_SECONDS: RecordingDurationPresetSeconds = 120

const presetSet = new Set<number>(RECORDING_DURATION_PRESET_SECONDS)

export function isValidMaxRecordingDurationSeconds(
  n: number
): n is RecordingDurationPresetSeconds {
  return Number.isInteger(n) && presetSet.has(n)
}

export function formatRecordingDurationLabel(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60)
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  }
  return `${seconds} seconds`
}
