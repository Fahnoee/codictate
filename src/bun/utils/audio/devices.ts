import { findMicRecorderBinary } from './find-mic-recorder'

/** Input device index → display name (Core Audio order, matches MicRecorder `record`). */
export async function findDevices(): Promise<Record<string, string>> {
  let micPath: string
  try {
    micPath = await findMicRecorderBinary()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(
      `[recording] MicRecorder not found — device list empty. ${msg}`
    )
    return {}
  }

  const proc = Bun.spawn([micPath, '--list-devices'], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdoutRaw, stderrText, exitCode] = await Promise.all([
    proc.stdout.text(),
    proc.stderr.text(),
    proc.exited,
  ])
  const stdout = stdoutRaw.trim()
  if (exitCode !== 0) {
    console.warn(
      `[recording] MicRecorder --list-devices failed (exit ${exitCode})`,
      stderrText.slice(0, 200) || ''
    )
    return {}
  }

  try {
    const parsed = JSON.parse(stdout) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
  } catch {
    console.warn('[recording] MicRecorder --list-devices returned invalid JSON')
  }
  return {}
}
