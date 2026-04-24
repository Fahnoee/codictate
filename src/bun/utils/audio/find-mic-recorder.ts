import { getPlatform } from '../../platform'

export const findMicRecorderBinary = (): Promise<string> =>
  getPlatform().findMicRecorderBinary()
