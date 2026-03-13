import { join } from 'node:path'

// Bundled binary takes priority — it's copied from vendors/ffmpeg during the build
// so the app is fully self-contained. Homebrew paths are kept as a fallback for
// developers running directly from source without a full build.
const CANDIDATE_PATHS = [
  join(import.meta.dir, '../native-helpers/ffmpeg'), // bundled (production)
  '/opt/homebrew/bin/ffmpeg', // Apple Silicon Homebrew (dev)
  '/usr/local/bin/ffmpeg', // Intel Homebrew (dev)
  '/usr/bin/ffmpeg', // rare system install
]

let resolvedPath: string | null = null

export const findFfmpegBinary = async (): Promise<string> => {
  if (resolvedPath) return resolvedPath

  for (const candidate of CANDIDATE_PATHS) {
    if (await Bun.file(candidate).exists()) {
      resolvedPath = candidate
      return candidate
    }
  }

  throw new Error(
    'ffmpeg not found. The bundled binary may be missing — try rebuilding with `bun run build:canary`.\n' +
      'For local development, install ffmpeg with: brew install ffmpeg'
  )
}
