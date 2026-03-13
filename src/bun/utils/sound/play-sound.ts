import { join } from 'node:path'

const soundPath = (filename: string) =>
  join(import.meta.dir, `../sounds/${filename}`)

// Fire-and-forget — does not block the caller
export const playStartSound = () => {
  // TODO: ADD fun mode
  // Bun.spawn(['afplay', soundPath('start.mp3')])
  Bun.spawn(['afplay', soundPath('dictation-start.wav')])
}

export const playEndSound = () => {
  // TODO: ADD fun mode
  // Bun.spawn(['afplay', soundPath('end.mp3')])
  Bun.spawn(['afplay', soundPath('dictation-stop.wav')])
}
