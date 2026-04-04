import { homedir } from 'os'
import { join } from 'path'
import {
  mkdirSync,
  existsSync,
  renameSync,
  unlinkSync,
  createWriteStream,
} from 'fs'
import {
  WHISPER_MODELS,
  whisperModelDownloadUrl,
  type WhisperModel,
} from '../../../shared/whisper-models'
import { log } from '../logger'

const MODELS_DIR = join(
  homedir(),
  'Library',
  'Application Support',
  'codictate',
  'models'
)

// Same relative pattern used in speech2text.ts — works for both dev and built app.
const BUNDLED_MODEL_PATH = join(
  import.meta.dir,
  '../native-helpers/ggml-large-v3-turbo-q5_0.bin'
)

export type ModelProgressCallback = (
  fraction: number,
  done: boolean,
  error?: string
) => void

class ModelManager {
  private downloads = new Map<string, AbortController>()

  private modelInfo(modelId: string): WhisperModel | undefined {
    return WHISPER_MODELS.find((m) => m.id === modelId)
  }

  isModelAvailable(modelId: string): boolean {
    const model = this.modelInfo(modelId)
    if (!model) return false
    if (model.bundled) return true
    return existsSync(join(MODELS_DIR, model.filename))
  }

  getModelPath(modelId: string): string {
    const model = this.modelInfo(modelId)
    if (!model) throw new Error(`Unknown whisper model: ${modelId}`)
    if (model.bundled) return BUNDLED_MODEL_PATH
    return join(MODELS_DIR, model.filename)
  }

  /** Returns a map of modelId → available for all known models. */
  getAvailabilityMap(): Record<string, boolean> {
    return Object.fromEntries(
      WHISPER_MODELS.map((m) => [m.id, this.isModelAvailable(m.id)])
    )
  }

  async downloadModel(
    modelId: string,
    onProgress: ModelProgressCallback
  ): Promise<void> {
    const model = this.modelInfo(modelId)
    if (!model || model.bundled) {
      onProgress(1, true)
      return
    }

    if (this.isModelAvailable(modelId)) {
      onProgress(1, true)
      return
    }

    mkdirSync(MODELS_DIR, { recursive: true })

    const destPath = join(MODELS_DIR, model.filename)
    const tempPath = destPath + '.tmp'
    const controller = new AbortController()
    this.downloads.set(modelId, controller)

    log('model-manager', 'starting download', {
      modelId,
      url: whisperModelDownloadUrl(model.filename),
    })

    try {
      const url = whisperModelDownloadUrl(model.filename)
      const response = await fetch(url, { signal: controller.signal })

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      const contentLength = Number(
        response.headers.get('Content-Length') ?? '0'
      )
      const reader = response.body.getReader()
      const writeStream = createWriteStream(tempPath)

      let received = 0

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        await new Promise<void>((resolve, reject) => {
          writeStream.write(value, (err) => {
            if (err) reject(err)
            else resolve()
          })
        })

        received += value.length
        if (contentLength > 0) {
          onProgress(received / contentLength, false)
        }
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end((err?: Error | null) => {
          if (err) reject(err)
          else resolve()
        })
      })

      renameSync(tempPath, destPath)
      this.downloads.delete(modelId)

      log('model-manager', 'download complete', { modelId })
      onProgress(1, true)
    } catch (err) {
      this.downloads.delete(modelId)

      try {
        unlinkSync(tempPath)
      } catch {
        // Partial file may not exist
      }

      const message =
        err instanceof Error && err.name === 'AbortError'
          ? 'Cancelled'
          : err instanceof Error
            ? err.message
            : 'Download failed'

      log('model-manager', 'download failed', { modelId, error: message })
      onProgress(0, true, message)
    }
  }

  cancelDownload(modelId: string): void {
    const controller = this.downloads.get(modelId)
    if (controller) {
      controller.abort()
      this.downloads.delete(modelId)
      log('model-manager', 'download cancelled', { modelId })
    }
  }
}

export const modelManager = new ModelManager()
