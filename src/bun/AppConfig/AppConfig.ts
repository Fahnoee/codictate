import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import {
  DEFAULT_MAX_RECORDING_DURATION_SECONDS,
  isValidMaxRecordingDurationSeconds,
  type RecordingDurationPresetSeconds,
} from '../../shared/recording-duration-presets'
import { SHORTCUT_OPTIONS } from '../../shared/shortcut-options'
import {
  isValidTranscriptionLanguageId,
  whisperCodeForTranscriptionId,
} from '../../shared/transcription-languages'
import type {
  AppSettings,
  FormattingEmailClosingStyle,
  FormattingEmailGreetingStyle,
  FormattingEnabledModes,
  FormattingImessageTone,
  FormattingSlackTone,
  FormattingDocumentTone,
  FormattingDocumentStructure,
  FormattingRuntimeSettings,
  RecordingIndicatorMode,
  ShortcutId,
  StreamTranscriptionMode,
  DictionaryEntry,
} from '../../shared/types'
import {
  DEFAULT_MODEL_ID,
  getStreamModeReadiness,
  isValidWhisperModelId,
} from '../../shared/whisper-models'
import {
  FORMATTING_MODE_ORDER,
  isValidDocumentStructure,
  isValidDocumentTone,
  isValidEmailClosingStyle,
  isValidEmailGreetingStyle,
  isValidFormattingModeId,
  isValidImessageTone,
  isValidSlackTone,
  type FormattingModeId,
} from '../../shared/formatting-modes'
import { modelManager } from '../utils/whisper/model-manager'
import { detectFormattingAvailable } from '../utils/formatting/formatting-availability'
import { disableDebug, enableDebug, log } from '../utils/logger'

const CONFIG_DIR = join(
  homedir(),
  'Library',
  'Application Support',
  'codictate'
)
const CONFIG_PATH = join(CONFIG_DIR, 'app-config.json')

const VALID_SHORTCUT_IDS = new Set<ShortcutId>(
  SHORTCUT_OPTIONS.map((o) => o.id)
)

function isValidShortcutId(id: unknown): id is ShortcutId {
  return typeof id === 'string' && VALID_SHORTCUT_IDS.has(id as ShortcutId)
}

const RECORDING_INDICATOR_MODES = new Set<RecordingIndicatorMode>([
  'off',
  'always',
  'when-active',
])

function isValidRecordingIndicatorMode(
  id: unknown
): id is RecordingIndicatorMode {
  return (
    typeof id === 'string' &&
    RECORDING_INDICATOR_MODES.has(id as RecordingIndicatorMode)
  )
}

function normalizeDictionaryKey(
  kind: DictionaryEntry['kind'],
  text: string,
  from?: string
): string {
  const normalizedText = text.trim().toLowerCase()
  if (kind === 'replacement') {
    return `replacement:${(from ?? '').trim().toLowerCase()}=>${normalizedText}`
  }
  return `fuzzy:${normalizedText}`
}

function defaultEnabledModes(): FormattingEnabledModes {
  return {
    email: false,
    imessage: false,
    slack: false,
    document: false,
  }
}

export class AppConfig {
  // Name is the primary key — stable across device list reorders.
  // Index is stored as a fallback for configs that predate name storage.
  private audioDeviceName: string | null
  private audioDevice: number
  private shortcutId: ShortcutId
  private shortcutHoldOnlyId: ShortcutId | null
  // debugMode is never persisted as true — always written as false on disk
  // so logging never silently resumes after a restart.
  private debugMode: boolean
  private funModeEnabled: boolean
  private transcriptionLanguageId: string
  private maxRecordingDuration: RecordingDurationPresetSeconds
  private whisperModelId: string
  private translateToEnglish: boolean
  /** Always `'auto'` or a valid transcription language id (never null). */
  private translateDefaultLanguageId: string
  /** False until first-run onboarding finishes; true for legacy configs missing the key. */
  private onboardingCompleted: boolean
  private recordingIndicatorMode: RecordingIndicatorMode
  private recordingIndicatorPosition: { x: number; y: number } | null
  private streamMode: boolean
  private streamTranscriptionMode: StreamTranscriptionMode
  private userDisplayName: string
  private formattingEnabled: boolean
  private formattingEnabledModes: FormattingEnabledModes
  private formattingForceModeId: FormattingModeId | null
  private formattingEmailIncludeSenderName: boolean
  private formattingEmailGreetingStyle: FormattingEmailGreetingStyle
  private formattingEmailClosingStyle: FormattingEmailClosingStyle
  private formattingEmailCustomGreeting: string
  private formattingEmailCustomClosing: string
  private formattingImessageTone: FormattingImessageTone
  private formattingImessageAllowEmoji: boolean
  private formattingImessageLightweight: boolean
  private formattingSlackTone: FormattingSlackTone
  private formattingSlackAllowEmoji: boolean
  private formattingSlackUseMarkdown: boolean
  private formattingSlackLightweight: boolean
  private formattingDocumentTone: FormattingDocumentTone
  private formattingDocumentStructure: FormattingDocumentStructure
  private formattingDocumentLightweight: boolean
  private audioDuckingLevel: number
  private audioDuckingIncludeHeadphones: boolean
  private audioDuckingIncludeBuiltInSpeakers: boolean
  /** True when formatting can be offered on this OS; runtime helper still handles failures safely. */
  private formattingAvailable: boolean
  private dictionaryEntries: DictionaryEntry[]
  private dictionaryAutoLearn: boolean
  /**
   * In-memory only: while set, the indicator window uses this mode during
   * onboarding preview (not persisted).
   */
  private recordingIndicatorOnboardingPreviewMode: RecordingIndicatorMode | null =
    null

  constructor() {
    this.audioDeviceName = null
    this.audioDevice = 0
    this.shortcutId = 'option-space'
    this.shortcutHoldOnlyId = null
    this.debugMode = false
    this.funModeEnabled = false
    this.transcriptionLanguageId = 'auto'
    this.maxRecordingDuration = DEFAULT_MAX_RECORDING_DURATION_SECONDS
    this.whisperModelId = DEFAULT_MODEL_ID
    this.translateToEnglish = false
    this.translateDefaultLanguageId = 'auto'
    this.onboardingCompleted = false
    this.recordingIndicatorMode = 'always'
    this.recordingIndicatorPosition = null
    this.streamMode = false
    this.streamTranscriptionMode = 'vad'
    this.userDisplayName = ''
    this.formattingEnabled = false
    this.formattingEnabledModes = defaultEnabledModes()
    this.formattingForceModeId = null
    this.formattingEmailIncludeSenderName = false
    this.formattingEmailGreetingStyle = 'auto'
    this.formattingEmailClosingStyle = 'auto'
    this.formattingEmailCustomGreeting = ''
    this.formattingEmailCustomClosing = ''
    this.formattingImessageTone = 'neutral'
    this.formattingImessageAllowEmoji = false
    this.formattingImessageLightweight = true
    this.formattingSlackTone = 'professional'
    this.formattingSlackAllowEmoji = false
    this.formattingSlackUseMarkdown = true
    this.formattingSlackLightweight = true
    this.formattingDocumentTone = 'neutral'
    this.formattingDocumentStructure = 'prose'
    this.formattingDocumentLightweight = true
    // Default: fully mute headphones too, so dictation never competes with playback.
    this.audioDuckingLevel = 0
    this.audioDuckingIncludeHeadphones = true
    this.audioDuckingIncludeBuiltInSpeakers = true
    this.formattingAvailable = detectFormattingAvailable()
    this.dictionaryEntries = []
    this.dictionaryAutoLearn = true
  }

  // --- Persistence ---

  public async load() {
    try {
      const file = Bun.file(CONFIG_PATH)
      const raw = await file.json()
      if (raw.audioDeviceName !== undefined)
        this.audioDeviceName = raw.audioDeviceName
      if (raw.audioDevice !== undefined) this.audioDevice = raw.audioDevice
      if (raw.shortcutId !== undefined && isValidShortcutId(raw.shortcutId)) {
        this.shortcutId = raw.shortcutId
      }
      if (
        raw.shortcutHoldOnlyId !== undefined &&
        raw.shortcutHoldOnlyId !== null &&
        isValidShortcutId(raw.shortcutHoldOnlyId)
      ) {
        this.shortcutHoldOnlyId = raw.shortcutHoldOnlyId
      } else if (raw.shortcutHoldOnlyId === null) {
        this.shortcutHoldOnlyId = null
      }
      if (
        raw.transcriptionLanguageId !== undefined &&
        isValidTranscriptionLanguageId(raw.transcriptionLanguageId)
      ) {
        this.transcriptionLanguageId = raw.transcriptionLanguageId
      }
      if (typeof raw.funModeEnabled === 'boolean') {
        this.funModeEnabled = raw.funModeEnabled
      }
      if (
        raw.maxRecordingDuration !== undefined &&
        isValidMaxRecordingDurationSeconds(raw.maxRecordingDuration)
      ) {
        this.maxRecordingDuration = raw.maxRecordingDuration
      }
      if (
        raw.whisperModelId !== undefined &&
        isValidWhisperModelId(raw.whisperModelId)
      ) {
        this.whisperModelId = raw.whisperModelId
      }
      if (raw.translateToEnglish !== undefined) {
        this.translateToEnglish = Boolean(raw.translateToEnglish)
      }
      {
        const rawTd = raw.translateDefaultLanguageId
        if (
          typeof rawTd === 'string' &&
          isValidTranscriptionLanguageId(rawTd)
        ) {
          this.translateDefaultLanguageId = rawTd
        } else {
          // Legacy `null` / missing / invalid → treat as unset default
          this.translateDefaultLanguageId = 'auto'
        }
      }
      if (raw.onboardingCompleted === true) {
        this.onboardingCompleted = true
      } else if (raw.onboardingCompleted === false) {
        this.onboardingCompleted = false
      } else {
        // Key absent: existing installs before this field shipped
        this.onboardingCompleted = true
      }
      if (
        raw.recordingIndicatorMode !== undefined &&
        isValidRecordingIndicatorMode(raw.recordingIndicatorMode)
      ) {
        this.recordingIndicatorMode = raw.recordingIndicatorMode
      }
      if (
        raw.recordingIndicatorPosition !== undefined &&
        raw.recordingIndicatorPosition !== null &&
        typeof raw.recordingIndicatorPosition === 'object' &&
        Number.isFinite(raw.recordingIndicatorPosition.x) &&
        Number.isFinite(raw.recordingIndicatorPosition.y)
      ) {
        this.recordingIndicatorPosition = {
          x: raw.recordingIndicatorPosition.x,
          y: raw.recordingIndicatorPosition.y,
        }
      } else if (raw.recordingIndicatorPosition === null) {
        this.recordingIndicatorPosition = null
      }
      if (
        this.shortcutHoldOnlyId !== null &&
        this.shortcutHoldOnlyId === this.shortcutId
      ) {
        this.shortcutHoldOnlyId = null
      }
      if (typeof raw.streamMode === 'boolean') {
        this.streamMode = raw.streamMode
      }
      if (
        raw.streamTranscriptionMode === 'live' ||
        raw.streamTranscriptionMode === 'vad'
      ) {
        this.streamTranscriptionMode = raw.streamTranscriptionMode
      }
      if (typeof raw.userDisplayName === 'string') {
        this.userDisplayName = raw.userDisplayName.trim()
      }

      // --- Formatting (new multi-enable model, with legacy migration) ---
      if (typeof raw.formattingEnabled === 'boolean') {
        this.formattingEnabled = raw.formattingEnabled
      } else if (typeof raw.formattingModeId === 'string') {
        // Legacy: any non-'none' mode implied formatting was active.
        this.formattingEnabled = raw.formattingModeId !== 'none'
      }
      if (
        raw.formattingEnabledModes !== undefined &&
        raw.formattingEnabledModes !== null &&
        typeof raw.formattingEnabledModes === 'object'
      ) {
        const next = defaultEnabledModes()
        for (const id of FORMATTING_MODE_ORDER) {
          const v = (raw.formattingEnabledModes as Record<string, unknown>)[id]
          if (typeof v === 'boolean') next[id] = v
        }
        this.formattingEnabledModes = next
      } else if (raw.formattingModeId === 'email') {
        // Legacy single-mode: flip email on so old users retain their behaviour.
        this.formattingEnabledModes = { ...defaultEnabledModes(), email: true }
      }
      if (raw.formattingForceModeId === null) {
        this.formattingForceModeId = null
      } else if (isValidFormattingModeId(raw.formattingForceModeId)) {
        this.formattingForceModeId = raw.formattingForceModeId
      }
      if (typeof raw.formattingEmailIncludeSenderName === 'boolean') {
        this.formattingEmailIncludeSenderName =
          raw.formattingEmailIncludeSenderName
      }
      if (isValidEmailGreetingStyle(raw.formattingEmailGreetingStyle)) {
        this.formattingEmailGreetingStyle = raw.formattingEmailGreetingStyle
      }
      if (isValidEmailClosingStyle(raw.formattingEmailClosingStyle)) {
        this.formattingEmailClosingStyle = raw.formattingEmailClosingStyle
      }
      if (typeof raw.formattingEmailCustomGreeting === 'string') {
        this.formattingEmailCustomGreeting = raw.formattingEmailCustomGreeting
      }
      if (typeof raw.formattingEmailCustomClosing === 'string') {
        this.formattingEmailCustomClosing = raw.formattingEmailCustomClosing
      }
      if (isValidImessageTone(raw.formattingImessageTone)) {
        this.formattingImessageTone = raw.formattingImessageTone
      }
      if (typeof raw.formattingImessageAllowEmoji === 'boolean') {
        this.formattingImessageAllowEmoji = raw.formattingImessageAllowEmoji
      }
      if (typeof raw.formattingImessageLightweight === 'boolean') {
        this.formattingImessageLightweight = raw.formattingImessageLightweight
      }
      if (isValidSlackTone(raw.formattingSlackTone)) {
        this.formattingSlackTone = raw.formattingSlackTone
      }
      if (typeof raw.formattingSlackAllowEmoji === 'boolean') {
        this.formattingSlackAllowEmoji = raw.formattingSlackAllowEmoji
      }
      if (typeof raw.formattingSlackUseMarkdown === 'boolean') {
        this.formattingSlackUseMarkdown = raw.formattingSlackUseMarkdown
      }
      if (typeof raw.formattingSlackLightweight === 'boolean') {
        this.formattingSlackLightweight = raw.formattingSlackLightweight
      }
      if (isValidDocumentTone(raw.formattingDocumentTone)) {
        this.formattingDocumentTone = raw.formattingDocumentTone
      }
      if (isValidDocumentStructure(raw.formattingDocumentStructure)) {
        this.formattingDocumentStructure = raw.formattingDocumentStructure
      }
      if (typeof raw.formattingDocumentLightweight === 'boolean') {
        this.formattingDocumentLightweight = raw.formattingDocumentLightweight
      }
      if (
        typeof raw.audioDuckingLevel === 'number' &&
        Number.isFinite(raw.audioDuckingLevel) &&
        raw.audioDuckingLevel >= 0 &&
        raw.audioDuckingLevel <= 100
      ) {
        this.audioDuckingLevel = raw.audioDuckingLevel
      }
      if (typeof raw.audioDuckingIncludeHeadphones === 'boolean') {
        this.audioDuckingIncludeHeadphones = raw.audioDuckingIncludeHeadphones
      }
      if (typeof raw.audioDuckingIncludeBuiltInSpeakers === 'boolean') {
        this.audioDuckingIncludeBuiltInSpeakers =
          raw.audioDuckingIncludeBuiltInSpeakers
      }
      if (Array.isArray(raw.dictionaryEntries)) {
        const seen = new Set<string>()
        const parsed: DictionaryEntry[] = []
        for (const e of raw.dictionaryEntries as unknown[]) {
          // Support legacy string[] format
          if (typeof e === 'string') {
            const text = e.trim()
            if (!text) continue
            const key = normalizeDictionaryKey('fuzzy', text)
            if (seen.has(key)) continue
            seen.add(key)
            parsed.push({ kind: 'fuzzy', text, source: 'manual' })
          } else if (
            e !== null &&
            typeof e === 'object' &&
            (typeof (e as Record<string, unknown>).word === 'string' ||
              typeof (e as Record<string, unknown>).text === 'string')
          ) {
            const r = e as Record<string, unknown>
            const source =
              r.source === 'auto' ? ('auto' as const) : ('manual' as const)
            const kind =
              r.kind === 'replacement'
                ? ('replacement' as const)
                : ('fuzzy' as const)
            const textValue =
              typeof r.text === 'string'
                ? r.text
                : typeof r.word === 'string'
                  ? r.word
                  : ''
            const text = textValue.trim()
            if (!text) continue
            const from =
              kind === 'replacement' && typeof r.from === 'string'
                ? r.from.trim()
                : undefined
            if (kind === 'replacement' && !from) continue
            const key = normalizeDictionaryKey(kind, text, from)
            if (seen.has(key)) continue
            seen.add(key)
            parsed.push(
              kind === 'replacement'
                ? { kind, from, text, source }
                : { kind, text, source }
            )
          }
        }
        this.dictionaryEntries = parsed
      }
      if (typeof raw.dictionaryAutoLearn === 'boolean') {
        this.dictionaryAutoLearn = raw.dictionaryAutoLearn
      }
      log('config', 'loaded app config', {
        shortcutId: this.shortcutId,
        shortcutHoldOnlyId: this.shortcutHoldOnlyId ?? undefined,
        streamMode: this.streamMode,
        streamTranscriptionMode: this.streamTranscriptionMode,
        translateToEnglish: this.translateToEnglish,
        transcriptionLanguageId: this.transcriptionLanguageId,
        formattingEnabled: this.formattingEnabled,
        formattingForceModeId: this.formattingForceModeId,
      })
    } catch {
      // No config file yet, defaults will be used
      log('config', 'using default app config', {
        shortcutId: this.shortcutId,
        streamMode: this.streamMode,
        streamTranscriptionMode: this.streamTranscriptionMode,
      })
    }
  }

  public async save() {
    mkdirSync(CONFIG_DIR, { recursive: true })
    await Bun.write(CONFIG_PATH, JSON.stringify(this.get(), null, 2))
  }

  // --- Schema ---

  public get() {
    return {
      audioDeviceName: this.audioDeviceName,
      audioDevice: this.audioDevice,
      shortcutId: this.shortcutId,
      shortcutHoldOnlyId: this.shortcutHoldOnlyId,
      funModeEnabled: this.funModeEnabled,
      transcriptionLanguageId: this.transcriptionLanguageId,
      maxRecordingDuration: this.maxRecordingDuration,
      whisperModelId: this.whisperModelId,
      translateToEnglish: this.translateToEnglish,
      translateDefaultLanguageId: this.translateDefaultLanguageId,
      onboardingCompleted: this.onboardingCompleted,
      recordingIndicatorMode: this.recordingIndicatorMode,
      recordingIndicatorPosition: this.recordingIndicatorPosition,
      streamMode: this.streamMode,
      streamTranscriptionMode: this.streamTranscriptionMode,
      userDisplayName: this.userDisplayName,
      formattingEnabled: this.formattingEnabled,
      formattingEnabledModes: this.formattingEnabledModes,
      formattingForceModeId: this.formattingForceModeId,
      formattingEmailIncludeSenderName: this.formattingEmailIncludeSenderName,
      formattingEmailGreetingStyle: this.formattingEmailGreetingStyle,
      formattingEmailClosingStyle: this.formattingEmailClosingStyle,
      formattingEmailCustomGreeting: this.formattingEmailCustomGreeting,
      formattingEmailCustomClosing: this.formattingEmailCustomClosing,
      formattingImessageTone: this.formattingImessageTone,
      formattingImessageAllowEmoji: this.formattingImessageAllowEmoji,
      formattingImessageLightweight: this.formattingImessageLightweight,
      formattingSlackTone: this.formattingSlackTone,
      formattingSlackAllowEmoji: this.formattingSlackAllowEmoji,
      formattingSlackUseMarkdown: this.formattingSlackUseMarkdown,
      formattingSlackLightweight: this.formattingSlackLightweight,
      formattingDocumentTone: this.formattingDocumentTone,
      formattingDocumentStructure: this.formattingDocumentStructure,
      formattingDocumentLightweight: this.formattingDocumentLightweight,
      audioDuckingLevel: this.audioDuckingLevel,
      audioDuckingIncludeHeadphones: this.audioDuckingIncludeHeadphones,
      audioDuckingIncludeBuiltInSpeakers:
        this.audioDuckingIncludeBuiltInSpeakers,
      dictionaryEntries: this.dictionaryEntries,
      dictionaryAutoLearn: this.dictionaryAutoLearn,
      // Always write false — debug mode must never silently resume after restart
      debugMode: false,
    }
  }

  // --- Getters / Setters ---

  /**
   * Saves both the device index and its name.
   * The name is the primary key used by resolveAudioDevice().
   */
  public async setAudioDevice(index: number, name?: string) {
    this.audioDevice = index
    if (name !== undefined) this.audioDeviceName = name
    await this.save()
  }

  /**
   * Returns the current device index by looking up the stored name
   * in the live device list. Falls back to the stored index if the
   * name is not found (e.g. device was removed or not yet present).
   */
  public resolveAudioDevice(devices: Record<string, string>): number {
    if (this.audioDeviceName !== null) {
      const entry = Object.entries(devices).find(
        ([, name]) => name === this.audioDeviceName
      )
      if (entry) return Number(entry[0])
    }
    return this.audioDevice
  }

  /** @deprecated Use resolveAudioDevice(devices) instead. */
  public getAudioDevice() {
    return this.audioDevice
  }

  public async setShortcutId(id: ShortcutId): Promise<boolean> {
    if (!VALID_SHORTCUT_IDS.has(id)) return false
    this.shortcutId = id
    if (this.shortcutHoldOnlyId === id) this.shortcutHoldOnlyId = null
    await this.save()
    return true
  }

  public async setShortcutHoldOnlyId(id: ShortcutId | null): Promise<boolean> {
    if (id !== null) {
      if (!VALID_SHORTCUT_IDS.has(id)) return false
      if (id === this.shortcutId) return false
    }
    this.shortcutHoldOnlyId = id
    await this.save()
    return true
  }

  public async setTranscriptionLanguageId(id: string): Promise<boolean> {
    if (!isValidTranscriptionLanguageId(id)) return false
    this.transcriptionLanguageId = id
    await this.save()
    return true
  }

  public getTranscriptionLanguageId(): string {
    return this.transcriptionLanguageId
  }

  /** Whisper `--language` value for normal transcription, or `null` when using auto-detect. */
  public getTranscriptionWhisperCode(): string | null {
    return whisperCodeForTranscriptionId(this.transcriptionLanguageId)
  }

  /**
   * Runtime Whisper `--language` value for the current mode.
   * Translate mode needs a fixed source language, but normal transcription keeps
   * its own setting and should never be rewritten just because translate toggled.
   */
  public getRuntimeTranscriptionWhisperCode(): string | null {
    if (!this.translateToEnglish) {
      return this.getTranscriptionWhisperCode()
    }

    const sourceLanguageId =
      this.transcriptionLanguageId !== 'auto'
        ? this.transcriptionLanguageId
        : this.translateDefaultLanguageId

    return whisperCodeForTranscriptionId(sourceLanguageId)
  }

  public getShortcutId(): ShortcutId {
    return this.shortcutId
  }

  public getShortcutHoldOnlyId(): ShortcutId | null {
    return this.shortcutHoldOnlyId
  }

  public async setDebugMode(enabled: boolean) {
    this.debugMode = enabled
    if (enabled) {
      enableDebug()
    } else {
      disableDebug()
    }
    await this.save()
  }

  public getDebugMode(): boolean {
    return this.debugMode
  }

  public getFunModeEnabled(): boolean {
    return this.funModeEnabled
  }

  public async setFunModeEnabled(enabled: boolean): Promise<boolean> {
    this.funModeEnabled = enabled
    await this.save()
    return true
  }

  public getMaxRecordingDurationSeconds(): number {
    return this.maxRecordingDuration
  }

  public async setMaxRecordingDurationSeconds(
    seconds: number
  ): Promise<boolean> {
    if (!isValidMaxRecordingDurationSeconds(seconds)) return false
    this.maxRecordingDuration = seconds
    await this.save()
    return true
  }

  public getWhisperModelId(): string {
    return this.whisperModelId
  }

  public async setWhisperModelId(id: string): Promise<boolean> {
    if (!isValidWhisperModelId(id)) return false
    this.whisperModelId = id
    await this.save()
    return true
  }

  public getTranslateToEnglish(): boolean {
    return this.translateToEnglish
  }

  public async setTranslateToEnglish(enabled: boolean): Promise<void> {
    this.translateToEnglish = enabled
    await this.save()
  }

  /**
   * Enables translate and pins the active source language so the Ready screen
   * picker reflects the spoken language while translation is active.
   */
  public async setTranslateOn(sourceLanguageId: string): Promise<boolean> {
    if (
      !isValidTranscriptionLanguageId(sourceLanguageId) ||
      sourceLanguageId === 'auto'
    ) {
      return false
    }
    this.transcriptionLanguageId = sourceLanguageId
    this.translateToEnglish = true
    await this.save()
    return true
  }

  /** Disables translate and returns the Ready screen language picker to auto-detect. */
  public async setTranslateOff(): Promise<void> {
    this.translateToEnglish = false
    this.transcriptionLanguageId = 'auto'
    await this.save()
  }

  public getTranslateDefaultLanguageId(): string {
    return this.translateDefaultLanguageId
  }

  public async setTranslateDefaultLanguageId(id: string): Promise<boolean> {
    if (!isValidTranscriptionLanguageId(id)) return false
    this.translateDefaultLanguageId = id
    await this.save()
    return true
  }

  public getSettings(): AppSettings {
    return {
      shortcutId: this.shortcutId,
      shortcutHoldOnlyId: this.shortcutHoldOnlyId,
      maxRecordingDuration: this.maxRecordingDuration,
      debugMode: this.debugMode,
      funModeEnabled: this.funModeEnabled,
      transcriptionLanguageId: this.transcriptionLanguageId,
      whisperModelId: this.whisperModelId,
      translateToEnglish: this.translateToEnglish,
      translateDefaultLanguageId: this.translateDefaultLanguageId,
      onboardingCompleted: this.onboardingCompleted,
      recordingIndicatorMode: this.recordingIndicatorMode,
      recordingIndicatorPosition: this.recordingIndicatorPosition,
      streamMode: this.streamMode,
      streamTranscriptionMode: this.streamTranscriptionMode,
      userDisplayName: this.userDisplayName,
      formattingEnabled: this.formattingEnabled,
      formattingEnabledModes: { ...this.formattingEnabledModes },
      formattingForceModeId: this.formattingForceModeId,
      formattingEmailIncludeSenderName: this.formattingEmailIncludeSenderName,
      formattingEmailGreetingStyle: this.formattingEmailGreetingStyle,
      formattingEmailClosingStyle: this.formattingEmailClosingStyle,
      formattingEmailCustomGreeting: this.formattingEmailCustomGreeting,
      formattingEmailCustomClosing: this.formattingEmailCustomClosing,
      formattingImessageTone: this.formattingImessageTone,
      formattingImessageAllowEmoji: this.formattingImessageAllowEmoji,
      formattingImessageLightweight: this.formattingImessageLightweight,
      formattingSlackTone: this.formattingSlackTone,
      formattingSlackAllowEmoji: this.formattingSlackAllowEmoji,
      formattingSlackUseMarkdown: this.formattingSlackUseMarkdown,
      formattingSlackLightweight: this.formattingSlackLightweight,
      formattingDocumentTone: this.formattingDocumentTone,
      formattingDocumentStructure: this.formattingDocumentStructure,
      formattingDocumentLightweight: this.formattingDocumentLightweight,
      audioDuckingLevel: this.audioDuckingLevel,
      audioDuckingIncludeHeadphones: this.audioDuckingIncludeHeadphones,
      audioDuckingIncludeBuiltInSpeakers:
        this.audioDuckingIncludeBuiltInSpeakers,
      formattingAvailable: this.formattingAvailable,
      dictionaryEntries: this.dictionaryEntries.map((e) => ({ ...e })),
      dictionaryAutoLearn: this.dictionaryAutoLearn,
    }
  }

  public getFormattingRuntimeSettings(): FormattingRuntimeSettings {
    return {
      formattingEnabled: this.formattingEnabled,
      formattingEnabledModes: { ...this.formattingEnabledModes },
      formattingForceModeId: this.formattingForceModeId,
      transcriptionLanguageId: this.transcriptionLanguageId,
      userDisplayName: this.userDisplayName,
      formattingEmailIncludeSenderName: this.formattingEmailIncludeSenderName,
      formattingEmailGreetingStyle: this.formattingEmailGreetingStyle,
      formattingEmailClosingStyle: this.formattingEmailClosingStyle,
      formattingEmailCustomGreeting: this.formattingEmailCustomGreeting,
      formattingEmailCustomClosing: this.formattingEmailCustomClosing,
      formattingImessageTone: this.formattingImessageTone,
      formattingImessageAllowEmoji: this.formattingImessageAllowEmoji,
      formattingImessageLightweight: this.formattingImessageLightweight,
      formattingSlackTone: this.formattingSlackTone,
      formattingSlackAllowEmoji: this.formattingSlackAllowEmoji,
      formattingSlackUseMarkdown: this.formattingSlackUseMarkdown,
      formattingSlackLightweight: this.formattingSlackLightweight,
      formattingDocumentTone: this.formattingDocumentTone,
      formattingDocumentStructure: this.formattingDocumentStructure,
      formattingDocumentLightweight: this.formattingDocumentLightweight,
    }
  }

  public getUserDisplayName(): string {
    return this.userDisplayName
  }

  public async setUserDisplayName(userDisplayName: string): Promise<boolean> {
    const normalized = userDisplayName.trim()
    this.userDisplayName = normalized
    if (normalized) {
      this.formattingEmailIncludeSenderName = true
    }
    await this.save()
    return true
  }

  public getFormattingEnabled(): boolean {
    return this.formattingEnabled
  }

  public async setFormattingEnabled(enabled: boolean): Promise<boolean> {
    this.formattingEnabled = enabled
    await this.save()
    return true
  }

  public getFormattingEnabledModes(): FormattingEnabledModes {
    return { ...this.formattingEnabledModes }
  }

  public async setFormattingModeEnabled(
    modeId: FormattingModeId,
    enabled: boolean
  ): Promise<boolean> {
    if (!isValidFormattingModeId(modeId)) return false
    this.formattingEnabledModes = {
      ...this.formattingEnabledModes,
      [modeId]: enabled,
    }
    await this.save()
    return true
  }

  public getFormattingForceModeId(): FormattingModeId | null {
    return this.formattingForceModeId
  }

  public async setFormattingForceModeId(
    modeId: FormattingModeId | null
  ): Promise<boolean> {
    if (modeId !== null && !isValidFormattingModeId(modeId)) return false
    this.formattingForceModeId = modeId
    await this.save()
    return true
  }

  public getFormattingEmailIncludeSenderName(): boolean {
    return this.formattingEmailIncludeSenderName
  }

  public async setFormattingEmailIncludeSenderName(
    enabled: boolean
  ): Promise<boolean> {
    this.formattingEmailIncludeSenderName = enabled
    await this.save()
    return true
  }

  public getFormattingEmailGreetingStyle(): FormattingEmailGreetingStyle {
    return this.formattingEmailGreetingStyle
  }

  public async setFormattingEmailGreetingStyle(
    style: FormattingEmailGreetingStyle
  ): Promise<boolean> {
    if (!isValidEmailGreetingStyle(style)) return false
    this.formattingEmailGreetingStyle = style
    await this.save()
    return true
  }

  public getFormattingEmailClosingStyle(): FormattingEmailClosingStyle {
    return this.formattingEmailClosingStyle
  }

  public async setFormattingEmailClosingStyle(
    style: FormattingEmailClosingStyle
  ): Promise<boolean> {
    if (!isValidEmailClosingStyle(style)) return false
    this.formattingEmailClosingStyle = style
    await this.save()
    return true
  }

  public getFormattingEmailCustomGreeting(): string {
    return this.formattingEmailCustomGreeting
  }

  public async setFormattingEmailCustomGreeting(
    text: string
  ): Promise<boolean> {
    this.formattingEmailCustomGreeting = text
    await this.save()
    return true
  }

  public getFormattingEmailCustomClosing(): string {
    return this.formattingEmailCustomClosing
  }

  public async setFormattingEmailCustomClosing(text: string): Promise<boolean> {
    this.formattingEmailCustomClosing = text
    await this.save()
    return true
  }

  public async setFormattingImessageTone(
    tone: FormattingImessageTone
  ): Promise<boolean> {
    if (!isValidImessageTone(tone)) return false
    this.formattingImessageTone = tone
    await this.save()
    return true
  }

  public async setFormattingImessageAllowEmoji(
    enabled: boolean
  ): Promise<boolean> {
    this.formattingImessageAllowEmoji = enabled
    await this.save()
    return true
  }

  public async setFormattingImessageLightweight(
    enabled: boolean
  ): Promise<boolean> {
    this.formattingImessageLightweight = enabled
    await this.save()
    return true
  }

  public async setFormattingSlackTone(
    tone: FormattingSlackTone
  ): Promise<boolean> {
    if (!isValidSlackTone(tone)) return false
    this.formattingSlackTone = tone
    await this.save()
    return true
  }

  public async setFormattingSlackAllowEmoji(
    enabled: boolean
  ): Promise<boolean> {
    this.formattingSlackAllowEmoji = enabled
    await this.save()
    return true
  }

  public async setFormattingSlackUseMarkdown(
    enabled: boolean
  ): Promise<boolean> {
    this.formattingSlackUseMarkdown = enabled
    await this.save()
    return true
  }

  public async setFormattingSlackLightweight(
    enabled: boolean
  ): Promise<boolean> {
    this.formattingSlackLightweight = enabled
    await this.save()
    return true
  }

  public async setFormattingDocumentTone(
    tone: FormattingDocumentTone
  ): Promise<boolean> {
    if (!isValidDocumentTone(tone)) return false
    this.formattingDocumentTone = tone
    await this.save()
    return true
  }

  public async setFormattingDocumentStructure(
    structure: FormattingDocumentStructure
  ): Promise<boolean> {
    if (!isValidDocumentStructure(structure)) return false
    this.formattingDocumentStructure = structure
    await this.save()
    return true
  }

  public async setFormattingDocumentLightweight(
    enabled: boolean
  ): Promise<boolean> {
    this.formattingDocumentLightweight = enabled
    await this.save()
    return true
  }

  public getAudioDuckingLevel(): number {
    return this.audioDuckingLevel
  }

  public async setAudioDuckingLevel(level: number): Promise<boolean> {
    if (!Number.isFinite(level) || level < 0 || level > 100) return false
    this.audioDuckingLevel = Math.round(level)
    await this.save()
    return true
  }

  public getAudioDuckingIncludeHeadphones(): boolean {
    return this.audioDuckingIncludeHeadphones
  }

  public async setAudioDuckingIncludeHeadphones(
    enabled: boolean
  ): Promise<boolean> {
    this.audioDuckingIncludeHeadphones = enabled
    await this.save()
    return true
  }

  public getAudioDuckingIncludeBuiltInSpeakers(): boolean {
    return this.audioDuckingIncludeBuiltInSpeakers
  }

  public async setAudioDuckingIncludeBuiltInSpeakers(
    enabled: boolean
  ): Promise<boolean> {
    this.audioDuckingIncludeBuiltInSpeakers = enabled
    await this.save()
    return true
  }

  public getFormattingAvailable(): boolean {
    return this.formattingAvailable
  }

  public getStreamMode(): boolean {
    return this.streamMode
  }

  public async setStreamMode(enabled: boolean): Promise<boolean> {
    if (enabled) {
      const readiness = getStreamModeReadiness(
        this.whisperModelId,
        this.transcriptionLanguageId,
        (id) => modelManager.isModelAvailable(id)
      )
      if (readiness.kind !== 'ready') {
        log('config', 'stream mode blocked', {
          reason: readiness.kind,
          whisperModelId: this.whisperModelId,
          transcriptionLanguageId: this.transcriptionLanguageId,
        })
        return false
      }
    }
    const previous = this.streamMode
    this.streamMode = enabled
    log('config', 'set stream mode', {
      previous,
      next: enabled,
    })
    await this.save()
    return true
  }

  public getStreamTranscriptionMode(): StreamTranscriptionMode {
    return this.streamTranscriptionMode
  }

  public async setStreamTranscriptionMode(
    mode: StreamTranscriptionMode
  ): Promise<void> {
    const previous = this.streamTranscriptionMode
    this.streamTranscriptionMode = mode
    log('config', 'set stream transcription mode', {
      previous,
      next: mode,
    })
    await this.save()
  }

  public async setOnboardingCompleted(completed: boolean): Promise<void> {
    this.onboardingCompleted = completed
    if (completed) {
      this.recordingIndicatorOnboardingPreviewMode = null
    }
    await this.save()
  }

  /**
   * Drive the desktop indicator during onboarding (step 3). Does not write disk.
   */
  public setRecordingIndicatorOnboardingPreview(
    active: boolean,
    mode?: RecordingIndicatorMode
  ): void {
    if (!active) {
      this.recordingIndicatorOnboardingPreviewMode = null
      return
    }
    const m =
      mode !== undefined && RECORDING_INDICATOR_MODES.has(mode)
        ? mode
        : this.recordingIndicatorMode
    this.recordingIndicatorOnboardingPreviewMode = m
  }

  public getRecordingIndicatorOnboardingPreviewMode(): RecordingIndicatorMode | null {
    return this.recordingIndicatorOnboardingPreviewMode
  }

  public getRecordingIndicatorMode(): RecordingIndicatorMode {
    return this.recordingIndicatorMode
  }

  public async setRecordingIndicatorMode(
    mode: RecordingIndicatorMode
  ): Promise<boolean> {
    if (!RECORDING_INDICATOR_MODES.has(mode)) return false
    this.recordingIndicatorMode = mode
    await this.save()
    return true
  }

  public getRecordingIndicatorPosition(): { x: number; y: number } | null {
    return this.recordingIndicatorPosition
  }

  /**
   * Persists only indicator geometry; other keys in app-config.json are preserved
   * via the same full-document write as every other setter.
   */
  public async setRecordingIndicatorPosition(
    x: number,
    y: number
  ): Promise<void> {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    this.recordingIndicatorPosition = { x, y }
    await this.save()
  }

  public getDictionaryEntries(): DictionaryEntry[] {
    return this.dictionaryEntries.map((e) => ({ ...e }))
  }

  public getDictionaryWords(): string[] {
    return this.dictionaryEntries.map((e) => e.text)
  }

  public async addDictionaryEntry(
    entry: Omit<DictionaryEntry, 'source'>,
    source: 'manual' | 'auto' = 'manual'
  ): Promise<boolean> {
    const text = entry.text.trim()
    const from = entry.kind === 'replacement' ? entry.from?.trim() : undefined
    if (!text) return false
    if (entry.kind === 'replacement' && !from) return false
    const key = normalizeDictionaryKey(entry.kind, text, from)
    if (
      this.dictionaryEntries.some(
        (e) => normalizeDictionaryKey(e.kind, e.text, e.from) === key
      )
    )
      return true
    this.dictionaryEntries = [
      ...this.dictionaryEntries,
      entry.kind === 'replacement'
        ? { kind: 'replacement', from, text, source }
        : { kind: 'fuzzy', text, source },
    ]
    await this.save()
    return true
  }

  public async removeDictionaryEntry(
    entry: Pick<DictionaryEntry, 'kind' | 'text' | 'from'>
  ): Promise<boolean> {
    const key = normalizeDictionaryKey(
      entry.kind,
      entry.text,
      entry.kind === 'replacement' ? entry.from : undefined
    )
    const next = this.dictionaryEntries.filter(
      (e) => normalizeDictionaryKey(e.kind, e.text, e.from) !== key
    )
    if (next.length === this.dictionaryEntries.length) return false
    this.dictionaryEntries = next
    await this.save()
    return true
  }

  public getDictionaryAutoLearn(): boolean {
    return this.dictionaryAutoLearn
  }

  public async setDictionaryAutoLearn(enabled: boolean): Promise<boolean> {
    this.dictionaryAutoLearn = enabled
    await this.save()
    return true
  }
}
