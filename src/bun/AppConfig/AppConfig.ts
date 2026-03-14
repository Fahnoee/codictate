import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync } from 'fs'
import type { ShortcutId, AppSettings } from '../../shared/types'

const CONFIG_DIR = join(
  homedir(),
  'Library',
  'Application Support',
  'codictate'
)
const CONFIG_PATH = join(CONFIG_DIR, 'app-config.json')

const MAX_RECORDING_DURATION = 120

export class AppConfig {
  private audioDevice: number
  private shortcutId: ShortcutId

  constructor() {
    this.audioDevice = 0
    this.shortcutId = 'option-space'
  }

  // --- Persistence ---

  public async load() {
    try {
      const file = Bun.file(CONFIG_PATH)
      const raw = await file.json()
      if (raw.audioDevice !== undefined) this.audioDevice = raw.audioDevice
      if (raw.shortcutId !== undefined) this.shortcutId = raw.shortcutId
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
      audioDevice: this.audioDevice,
      shortcutId: this.shortcutId,
    }
  }

  // --- Getters / Setters ---

  public async setAudioDevice(newDevice?: number) {
    if (newDevice !== undefined) {
      this.audioDevice = newDevice
      await this.save()
    }
  }

  public getAudioDevice() {
    return this.audioDevice
  }

  public async setShortcutId(id: ShortcutId) {
    this.shortcutId = id
    await this.save()
  }

  public getShortcutId(): ShortcutId {
    return this.shortcutId
  }

  public getSettings(): AppSettings {
    return {
      shortcutId: this.shortcutId,
      maxRecordingDuration: MAX_RECORDING_DURATION,
    }
  }
}
