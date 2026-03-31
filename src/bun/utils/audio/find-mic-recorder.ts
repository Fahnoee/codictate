import { join } from 'node:path'

// Bundled binary from electrobun copy; dev: same-dir binary from `build:native`.
const CANDIDATE_PATHS = [
  join(import.meta.dir, '../native-helpers/MicRecorder'),
  join(import.meta.dir, 'MicRecorder'),
]

let resolvedPath: string | null = null

export const findMicRecorderBinary = async (): Promise<string> => {
  if (resolvedPath) return resolvedPath

  for (const candidate of CANDIDATE_PATHS) {
    if (await Bun.file(candidate).exists()) {
      resolvedPath = candidate
      return candidate
    }
  }

  throw new Error(
    'MicRecorder not found. Run `bun run build:native` (or `swiftc` per src/scripts/build-swift.sh) so src/bun/utils/audio/MicRecorder exists, then rebuild the app.'
  )
}
