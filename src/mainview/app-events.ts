import type { AppStatus, PermissionState, SettingsPane } from '../shared/types'

export type { PermissionState }

type EventMap = {
  permissions: PermissionState
  status: AppStatus
  openSettings: SettingsPane
}

type Unsubscribe = () => void

class AppEventBus {
  private listeners = new Map<string, Set<(data: unknown) => void>>()

  on<K extends keyof EventMap>(
    event: K,
    listener: (data: EventMap[K]) => void
  ): Unsubscribe {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    const set = this.listeners.get(event)!
    set.add(listener as (data: unknown) => void)
    return () => set.delete(listener as (data: unknown) => void)
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]) {
    this.listeners.get(event)?.forEach((fn) => fn(data))
  }
}

export const appEvents = new AppEventBus()
