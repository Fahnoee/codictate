import { findFfmpegBinary } from './find-ffmpeg'

export async function findDevices(): Promise<Record<string, string>> {
  let ffmpegPath: string
  try {
    ffmpegPath = await findFfmpegBinary()
  } catch (error) {
    console.error(error)
    return {}
  }

  const proc = Bun.spawn(
    [ffmpegPath, '-f', 'avfoundation', '-list_devices', 'true', '-i', ''],
    { stderr: 'pipe' }
  )

  const out = await proc.stderr.text()

  const audioStart = out.indexOf('AVFoundation audio devices')
  if (audioStart === -1) return {}

  const deviceLine = /\[AVFoundation indev @ 0x[\da-f]+\] \[(\d+)\] (.+)/g

  return Object.fromEntries(
    [...out.substring(audioStart).matchAll(deviceLine)].map(
      ([, index, name]) => [index, name.trim()]
    )
  )
}
