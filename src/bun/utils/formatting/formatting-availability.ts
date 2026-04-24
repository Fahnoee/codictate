import { getPlatform } from '../../platform'

export async function findFormatterHelperPath(): Promise<string> {
  return getPlatform().findFormatterHelperBinary()
}

export function detectFormattingAvailable(): boolean {
  return getPlatform().isFormattingAvailable()
}
