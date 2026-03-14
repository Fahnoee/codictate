import { AppConfig } from '../AppConfig/AppConfig'

export const DEVICE_ACTION_PREFIX = 'select-device-action'

export const buildDeviceMenuItems = (
  devices: Record<string, string>,
  selectedDevice?: number
): { type: 'normal'; label: string; action: string; checked?: boolean }[] =>
  Object.keys(devices).map((deviceKey) => ({
    type: 'normal' as const,
    label: devices[deviceKey],
    action: `${DEVICE_ACTION_PREFIX}-${deviceKey}`,
    checked:
      selectedDevice !== undefined && Number(deviceKey) === selectedDevice,
  }))

export const handleDeviceAction = async (
  action: string,
  appConfig: AppConfig,
  onSelected?: (device: number) => void
) => {
  if (!action.startsWith(DEVICE_ACTION_PREFIX)) return
  try {
    const selectedDevice = Number(action.split(`${DEVICE_ACTION_PREFIX}-`)[1])
    await appConfig.setAudioDevice(selectedDevice)
    onSelected?.(selectedDevice)
    console.log('Selected device:', selectedDevice)
  } catch (error) {
    console.error('Error selecting audio device:', error)
  }
}
