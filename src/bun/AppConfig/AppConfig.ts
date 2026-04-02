import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync } from 'fs'
import type { ShortcutId, AppSettings } from '../../shared/types'
import {
  isValidTranscriptionLanguageId,
  whisperCodeForTranscriptionId,
} from '../../shared/transcription-languages'
import { enableDebug, disableDebug } from '../utils/logger'

const CONFIG_DIR = join(
  homedir(),
  'Library',
  'Application Support',
  'codictate'
)
const CONFIG_PATH = join(CONFIG_DIR, 'app-config.json')

const MAX_RECORDING_DURATION = 120

export class AppConfig {
  // Name is the primary key — stable across device list reorders.
  // Index is stored as a fallback for configs that predate name storage.
  private audioDeviceName: string | null
  private audioDevice: number
  private shortcutId: ShortcutId
  // debugMode is never persisted as true — always written as false on disk
  // so logging never silently resumes after a restart.
  private debugMode: boolean
  private transcriptionLanguageId: string

  constructor() {
    this.audioDeviceName = null
    this.audioDevice = 0
    this.shortcutId = 'option-space'
    this.debugMode = false
    this.transcriptionLanguageId = 'auto'
  }

  // --- Persistence ---

  public async load() {
    try {
      const file = Bun.file(CONFIG_PATH)
      const raw = await file.json()
      if (raw.audioDeviceName !== undefined)
        this.audioDeviceName = raw.audioDeviceName
      if (raw.audioDevice !== undefined) this.audioDevice = raw.audioDevice
      if (raw.shortcutId !== undefined) this.shortcutId = raw.shortcutId
      if (
        raw.transcriptionLanguageId !== undefined &&
        isValidTranscriptionLanguageId(raw.transcriptionLanguageId)
      ) {
        this.transcriptionLanguageId = raw.transcriptionLanguageId
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
      transcriptionLanguageId: this.transcriptionLanguageId,
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

  public async setShortcutId(id: ShortcutId) {
    this.shortcutId = id
    await this.save()
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

  public getSettings(): AppSettings {
    return {
      shortcutId: this.shortcutId,
      maxRecordingDuration: MAX_RECORDING_DURATION,
      debugMode: this.debugMode,
      transcriptionLanguageId: this.transcriptionLanguageId,
    }
  }
}
