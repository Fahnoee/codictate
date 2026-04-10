import { findMicRecorderBinary } from './find-mic-recorder'

/**
 * Reads microphone TCC state in a **fresh** MicRecorder process.
 * The long-lived KeyListener often keeps a stale `AVCaptureDevice.authorizationStatus`
 * after the user grants access in System Settings; a one-shot helper sees the real value.
 */
export async function checkMicrophoneAuthorization(): Promise<boolean> {
  const micPath = await findMicRecorderBinary()
  const proc = Bun.spawn([micPath, '--mic-authorization'], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, exitCode] = await Promise.all([
    proc.stdout.text(),
    proc.exited,
  ])
  if (exitCode !== 0) return false
  try {
    const parsed = JSON.parse(stdout.trim()) as { microphone?: boolean }
    return parsed.microphone === true
  } catch {
    return false
  }
}
