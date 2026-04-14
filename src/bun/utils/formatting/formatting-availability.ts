import { join } from 'node:path'

const CANDIDATE_PATHS = [
  // Bundled app runtime: Resources/app/bun -> Resources/app/native-helpers
  join(import.meta.dir, '../native-helpers/CodictateFormatterHelper'),
  // Local repo source tree fallback
  join(
    import.meta.dir,
    '../../../../vendors/formatter/CodictateFormatterHelper'
  ),
  // Local dev helper beside the source package/build output
  join(import.meta.dir, 'CodictateFormatterHelper'),
]

let resolvedPath: string | null = null

export async function findFormatterHelperPath(): Promise<string> {
  if (resolvedPath) return resolvedPath

  for (const candidate of CANDIDATE_PATHS) {
    if (await Bun.file(candidate).exists()) {
      resolvedPath = candidate
      return candidate
    }
  }

  throw new Error(
    'CodictateFormatterHelper not found. Run `bun run build:native` so the formatter helper is vendored, then rebuild the app.'
  )
}

export function detectFormattingAvailable(): boolean {
  if (process.platform !== 'darwin') return false

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
