import { existsSync } from 'fs'
import { getPlatform } from '../../platform'
import { getFormatterModelConfig } from '../../../bun/platform/runtime'
import type { FormatterModelTier } from '../../../shared/types'

/** Resolve the vendored llama-cli binary path. Throws if the build hasn't run. */
export async function findLlamaBinaryPath(): Promise<string> {
  return getPlatform().findLlamaBinary()
}

/**
 * Whether the platform can run the formatter at all (vendored llama-cli
 * binary is present). A separate check (`isFormatterModelInstalled`) decides
 * whether the model has been downloaded yet.
 */
export function detectFormattingAvailable(): boolean {
  return getPlatform().isFormattingAvailable()
}

/** True if the GGUF for the given tier has been downloaded. */
export function isFormatterModelInstalled(tier: FormatterModelTier): boolean {
  return existsSync(getFormatterModelConfig(tier).path)
}
