import { AppConfig } from '../AppConfig/AppConfig'

export const DEVICE_ACTION_PREFIX = 'select-device-action'

export const buildDeviceMenuItems = (
  devices: Record<string, string>
): { type: 'normal'; label: string; action: string }[] =>
  Object.keys(devices).map((deviceKey) => ({
    type: 'normal' as const,
    label: devices[deviceKey],
    action: `${DEVICE_ACTION_PREFIX}-${deviceKey}`,
  }))

export const handleDeviceAction = async (
  action: string,
  appConfig: AppConfig
) => {
  if (!action.startsWith(DEVICE_ACTION_PREFIX)) return
  try {
    const selectedDevice = Number(action.split(`${DEVICE_ACTION_PREFIX}-`)[1])
    await appConfig.setAudioDevice(selectedDevice)
    console.log('Selected device:', selectedDevice)
  } catch (error) {
    console.error('Error selecting audio device:', error)
  }
}
