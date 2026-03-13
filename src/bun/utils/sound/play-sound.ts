import { join } from 'node:path'

const soundPath = (filename: string) =>
  join(import.meta.dir, `../sounds/${filename}`)

// Fire-and-forget — does not block the caller
export const playStartSound = () => {
  Bun.spawn(['afplay', soundPath('start.mp3')])
}

export const playEndSound = () => {
  Bun.spawn(['afplay', soundPath('end.mp3')])
}
