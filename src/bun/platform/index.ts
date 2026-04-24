import { MacOSPlatformProvider } from './macos'
import { LinuxPlatformProvider } from './linux'
import { WindowsPlatformProvider } from './windows'
import type { PlatformProvider } from './types'

export type { PlatformProvider } from './types'
export type { PermissionType } from './types'

let _platform: PlatformProvider | null = null

export function getPlatform(): PlatformProvider {
  if (_platform) return _platform
  switch (process.platform) {
    case 'darwin':
      _platform = new MacOSPlatformProvider()
      break
    case 'linux':
      _platform = new LinuxPlatformProvider()
      break
    case 'win32':
      _platform = new WindowsPlatformProvider()
      break
    default:
      throw new Error(`Unsupported platform: ${process.platform}`)
  }
  return _platform
}
