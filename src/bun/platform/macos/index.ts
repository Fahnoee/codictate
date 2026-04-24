import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'
import type { PlatformProvider, PermissionType } from '../types'

const PERMISSION_URLS: Record<PermissionType, string> = {
  inputMonitoring:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
  microphone:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  accessibility:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  documents:
    'x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders',
}

function resolveBinary(candidates: string[]): string | null {
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

async function resolveBinaryAsync(
  candidates: string[]
): Promise<string | null> {
  for (const p of candidates) {
    if (await Bun.file(p).exists()) return p
  }
  return null
}

export class MacOSPlatformProvider implements PlatformProvider {
  getDataDir(): string {
    return join(homedir(), 'Library', 'Application Support', 'codictate')
  }

  getTempPath(filename: string): string {
    return join(tmpdir(), filename)
  }

  playSound(filePath: string): void {
    Bun.spawn(['afplay', filePath])
  }

  openUrl(url: string): void {
    Bun.spawn(['open', url])
  }

  getPermissionSettingsUrl(type: PermissionType): string | null {
    return PERMISSION_URLS[type] ?? null
  }

  isFormattingAvailable(): boolean {
    try {
      const result = Bun.spawnSync(['sw_vers', '-productVersion'], {
        stdout: 'pipe',
      })
      if (result.exitCode !== 0) return false
      const version = result.stdout.toString().trim()
      const major = parseInt(version.split('.')[0], 10)
      return !isNaN(major) && major >= 26
    } catch {
      return false
    }
  }

  findKeyListenerBinary(): string {
    // Production: Bun bundle dir → ../native-helpers/
    // Dev: beside the compiled Swift source
    const candidates = [
      join(import.meta.dir, '../native-helpers/KeyListener'),
      join(import.meta.dir, '../../utils/keyboard/KeyListener'),
    ]
    const found = resolveBinary(candidates)
    if (!found)
      throw new Error(
        'KeyListener not found. Run `bun run build:native` so src/bun/utils/keyboard/KeyListener exists, then rebuild.'
      )
    return found
  }

  async findMicRecorderBinary(): Promise<string> {
    const candidates = [
      join(import.meta.dir, '../native-helpers/MicRecorder'),
      join(import.meta.dir, '../../utils/audio/MicRecorder'),
    ]
    const found = await resolveBinaryAsync(candidates)
    if (!found)
      throw new Error(
        'MicRecorder not found. Run `bun run build:native` so src/bun/utils/audio/MicRecorder exists, then rebuild.'
      )
    return found
  }

  findWindowHelperBinary(): string | null {
    const candidates = [
      join(import.meta.dir, '../native-helpers/CodictateWindowHelper'),
      join(process.cwd(), 'vendors/window-helper/CodictateWindowHelper'),
    ]
    return resolveBinary(candidates)
  }

  findObserverHelperBinary(): string | null {
    const candidates = [
      join(import.meta.dir, '../native-helpers/CodictateObserverHelper'),
      join(process.cwd(), 'vendors/observer/CodictateObserverHelper'),
    ]
    return resolveBinary(candidates)
  }

  async findFormatterHelperBinary(): Promise<string> {
    const candidates = [
      join(import.meta.dir, '../native-helpers/CodictateFormatterHelper'),
      join(process.cwd(), 'vendors/formatter/CodictateFormatterHelper'),
      join(import.meta.dir, '../../utils/formatting/CodictateFormatterHelper'),
    ]
    const found = await resolveBinaryAsync(candidates)
    if (!found)
      throw new Error(
        'CodictateFormatterHelper not found. Run `bun run build:native` or `scripts/pre-build.ts`.'
      )
    return found
  }

  findParakeetHelperBinary(): string {
    const candidates = [
      join(import.meta.dir, '../native-helpers/CodictateParakeetHelper'),
      join(process.cwd(), 'vendors/parakeet/CodictateParakeetHelper'),
    ]
    const found = resolveBinary(candidates)
    if (!found)
      throw new Error(
        'CodictateParakeetHelper not found. Run `scripts/pre-build.ts` to build it.'
      )
    return found
  }
}
