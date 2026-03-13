import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync } from 'fs'

const CONFIG_DIR = join(
  homedir(),
  'Library',
  'Application Support',
  'codictate'
)
const CONFIG_PATH = join(CONFIG_DIR, 'app-config.json')

export class AppConfig {
  private audioDevice: number

  constructor() {
    this.audioDevice = 0
  }

  // --- Persistence ---

  public async load() {
    try {
      const file = Bun.file(CONFIG_PATH)
      const raw = await file.json()
      if (raw.audioDevice !== undefined) this.audioDevice = raw.audioDevice
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
}
