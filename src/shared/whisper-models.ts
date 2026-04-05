export interface WhisperModel {
  id: string
  filename: string
  sizeMB: number
  label: string
  description: string
  bundled?: boolean
}

export const WHISPER_MODELS: WhisperModel[] = [
  {
    id: 'small-q5_1',
    filename: 'ggml-small-q5_1.bin',
    sizeMB: 181,
    label: 'Small',
    description: 'Good accuracy',
  },
  {
    id: 'large-v3-turbo-q5_0',
    filename: 'ggml-large-v3-turbo-q5_0.bin',
    sizeMB: 574,
    label: 'Turbo',
    description: 'Fast & very accurate — default',
    bundled: true,
  },
  {
    id: 'large-v3-q5_0',
    filename: 'ggml-large-v3-q5_0.bin',
    sizeMB: 1100,
    label: 'Large',
    description: 'Most accurate, best for translation',
  },
]

export const DEFAULT_MODEL_ID = 'large-v3-turbo-q5_0'

/** Whisper models that support the `-tr` (translate to English) flag. Turbo cannot. */
export const TRANSLATE_CAPABLE_MODEL_IDS = [
  'small-q5_1',
  'large-v3-q5_0',
] as const

export type TranslateCapableModelId =
  (typeof TRANSLATE_CAPABLE_MODEL_IDS)[number]

/** Large-accuracy model id (translate-capable). Use this instead of a generic “translate model” alias. */
export const LARGE_V3_Q5_MODEL_ID: TranslateCapableModelId = 'large-v3-q5_0'

/** When Turbo is selected and no translate model is on disk yet, prefer downloading Small first (smaller). */
export const DEFAULT_TRANSLATE_DOWNLOAD_MODEL_ID: TranslateCapableModelId =
  'small-q5_1'

export const WHISPER_MODEL_IDS = WHISPER_MODELS.map((m) => m.id)

export function isTranslateCapableModelId(
  id: string
): id is TranslateCapableModelId {
  return (TRANSLATE_CAPABLE_MODEL_IDS as readonly string[]).includes(id)
}

export function resolveTranslateModelId(
  selectedWhisperModelId: string,
  isModelAvailable: (id: string) => boolean
): TranslateCapableModelId | null {
  if (!isTranslateCapableModelId(selectedWhisperModelId)) {
    return null
  }
  if (!isModelAvailable(selectedWhisperModelId)) {
    return null
  }
  return selectedWhisperModelId
}

export function hasAnyTranslateCapableModelAvailable(
  isModelAvailable: (id: string) => boolean
): boolean {
  return TRANSLATE_CAPABLE_MODEL_IDS.some((id) => isModelAvailable(id))
}

export type TranslateReadiness =
  | { kind: 'ready' }
  | { kind: 'need_download' }
  | { kind: 'need_switch_model' }
  | { kind: 'need_language' }

/**
 * Whether translate can run from the current transcription model + language settings.
 * Turbo + downloaded Small/Large → `need_switch_model` (user must select Small or Large).
 */
export function getTranslateReadiness(
  whisperModelId: string,
  transcriptionLanguageId: string,
  translateDefaultLanguageId: string | null,
  isModelAvailable: (id: string) => boolean
): TranslateReadiness {
  const langOk =
    transcriptionLanguageId !== 'auto' || translateDefaultLanguageId != null
  if (!langOk) {
    return { kind: 'need_language' }
  }

  if (resolveTranslateModelId(whisperModelId, isModelAvailable) !== null) {
    return { kind: 'ready' }
  }

  if (isTranslateCapableModelId(whisperModelId)) {
    return { kind: 'need_download' }
  }

  if (hasAnyTranslateCapableModelAvailable(isModelAvailable)) {
    return { kind: 'need_switch_model' }
  }

  return { kind: 'need_download' }
}

export function getWhisperModel(id: string): WhisperModel | undefined {
  return WHISPER_MODELS.find((m) => m.id === id)
}

export function isValidWhisperModelId(id: string): boolean {
  return WHISPER_MODEL_IDS.includes(id)
}

export function formatModelSize(sizeMB: number): string {
  if (sizeMB >= 1000) return `${(sizeMB / 1000).toFixed(1)} GB`
  return `${sizeMB} MB`
}

/** Download URL pattern from the whisper.cpp download script. */
export function whisperModelDownloadUrl(filename: string): string {
  return `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${filename}`
}
