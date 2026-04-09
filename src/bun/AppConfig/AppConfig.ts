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
  RecordingIndicatorMode,
  ShortcutId,
} from '../../shared/types'
import {
  DEFAULT_MODEL_ID,
  isValidWhisperModelId,
} from '../../shared/whisper-models'
import { disableDebug, enableDebug } from '../utils/logger'

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
    this.transcriptionLanguageId = 'auto'
    this.maxRecordingDuration = DEFAULT_MAX_RECORDING_DURATION_SECONDS
    this.whisperModelId = DEFAULT_MODEL_ID
    this.translateToEnglish = false
    this.translateDefaultLanguageId = 'auto'
    this.onboardingCompleted = false
    this.recordingIndicatorMode = 'always'
    this.recordingIndicatorPosition = null
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
    } catch {
      // No config file yet, defaults will be used
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
      transcriptionLanguageId: this.transcriptionLanguageId,
      maxRecordingDuration: this.maxRecordingDuration,
      whisperModelId: this.whisperModelId,
      translateToEnglish: this.translateToEnglish,
      translateDefaultLanguageId: this.translateDefaultLanguageId,
      onboardingCompleted: this.onboardingCompleted,
      recordingIndicatorMode: this.recordingIndicatorMode,
      recordingIndicatorPosition: this.recordingIndicatorPosition,
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

  /** Whisper `--language` value, or `null` when using auto-detect. */
  public getTranscriptionWhisperCode(): string | null {
    return whisperCodeForTranscriptionId(this.transcriptionLanguageId)
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
   * Atomically enables translate and pins the source language in a single write.
   * `transcriptionLanguageId` becomes `sourceLanguageId` so whisper knows the
   * source; turning translate off resets it back to auto.
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

  /** Atomically disables translate and resets `transcriptionLanguageId` to auto in one write. */
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
      transcriptionLanguageId: this.transcriptionLanguageId,
      whisperModelId: this.whisperModelId,
      translateToEnglish: this.translateToEnglish,
      translateDefaultLanguageId: this.translateDefaultLanguageId,
      onboardingCompleted: this.onboardingCompleted,
      recordingIndicatorMode: this.recordingIndicatorMode,
      recordingIndicatorPosition: this.recordingIndicatorPosition,
    }
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
}
