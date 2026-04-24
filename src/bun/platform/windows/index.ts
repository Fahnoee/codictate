/**
 * Windows platform implementation.
 *
 * CONTRIBUTING: To add Windows support, implement the native helper binaries
 * listed below and update the `find*Binary` methods to resolve them.
 * Each helper must speak the same line-delimited JSON protocol on stdin/stdout
 * as the macOS Swift equivalents — see src/bun/platform/types.ts.
 *
 * Suggested tech stack:
 *   KeyListener   — C# (RegisterHotKey + low-level keyboard hook + SendInput) or Rust (rdev)
 *   MicRecorder   — C# (NAudio/WASAPI) or Rust (cpal + hound)
 *   WindowHelper  — WPF/WinForms floating window or Electrobun BrowserWindow (optional)
 *   ObserverHelper — UI Automation (IUIAutomation) for text observation
 */

import { homedir, tmpdir } from 'os'
import { join } from 'path'
import type { PlatformProvider, PermissionType } from '../types'

export class WindowsPlatformProvider implements PlatformProvider {
  getDataDir(): string {
    const appData = process.env.APPDATA
    const base = appData ?? join(homedir(), 'AppData', 'Roaming')
    return join(base, 'codictate')
  }

  getTempPath(filename: string): string {
    return join(tmpdir(), filename)
  }

  playSound(filePath: string): void {
    // PowerShell SoundPlayer — works for WAV; MP3 needs a different approach
    Bun.spawn([
      'powershell',
      '-NoProfile',
      '-Command',
      `(New-Object System.Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync()`,
    ])
  }

  openUrl(url: string): void {
    Bun.spawn(['cmd', '/c', 'start', '', url])
  }

  getPermissionSettingsUrl(_type: PermissionType): string | null {
    return null
  }

  isFormattingAvailable(): boolean {
    return false
  }

  // ── Unimplemented native helpers ──────────────────────────────────────────

  findKeyListenerBinary(): string {
    throw new Error(
      '[Windows] KeyListener is not yet implemented.\n' +
        'Contribute a binary at native/windows/KeyListener.exe that speaks the same\n' +
        'JSON/stdio protocol as the macOS Swift version — see src/bun/platform/types.ts'
    )
  }

  async findMicRecorderBinary(): Promise<string> {
    throw new Error(
      '[Windows] MicRecorder is not yet implemented.\n' +
        'Contribute a binary at native/windows/MicRecorder.exe that records WAV via\n' +
        'WASAPI and speaks the same CLI protocol as the macOS Swift version.'
    )
  }

  findWindowHelperBinary(): string | null {
    return null
  }

  findObserverHelperBinary(): string | null {
    return null
  }

  async findFormatterHelperBinary(): Promise<string> {
    throw new Error(
      '[Windows] On-device AI formatting is not available on Windows.'
    )
  }

  findParakeetHelperBinary(): string {
    throw new Error(
      '[Windows] CodictateParakeetHelper (Core ML) is macOS-only.\n' +
        'Stream mode is not available on Windows.'
    )
  }
}
