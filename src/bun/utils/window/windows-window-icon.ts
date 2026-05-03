import { join } from 'node:path'
import { dlopen, ptr, type Pointer } from 'bun:ffi'
import { getPlatformRuntime } from '../../platform/runtime'

const WM_SETICON = 0x0080
const ICON_SMALL = 0
const ICON_BIG = 1
const GCLP_HICON = -14
const GCLP_HICONSM = -34
const IMAGE_ICON = 1
const LR_LOADFROMFILE = 0x0010

type WindowWithPtr = {
  ptr: Pointer
}

let user32: ReturnType<
  typeof dlopen<{
    LoadImageW: {
      args: ['ptr', 'ptr', 'u32', 'i32', 'i32', 'u32']
      returns: 'ptr'
    }
    SendMessageW: {
      args: ['ptr', 'u32', 'usize', 'ptr']
      returns: 'ptr'
    }
    SetClassLongPtrW: {
      args: ['ptr', 'i32', 'ptr']
      returns: 'ptr'
    }
  }>
> | null = null

function getUser32() {
  user32 ??= dlopen('user32.dll', {
    LoadImageW: {
      args: ['ptr', 'ptr', 'u32', 'i32', 'i32', 'u32'],
      returns: 'ptr',
    },
    SendMessageW: {
      args: ['ptr', 'u32', 'usize', 'ptr'],
      returns: 'ptr',
    },
    SetClassLongPtrW: {
      args: ['ptr', 'i32', 'ptr'],
      returns: 'ptr',
    },
  })
  return user32.symbols
}

function loadIcon(iconPath: string, size: number): Pointer | null {
  const pathBuffer = Buffer.from(`${iconPath}\0`, 'utf16le')
  return getUser32().LoadImageW(
    null,
    ptr(pathBuffer),
    IMAGE_ICON,
    size,
    size,
    LR_LOADFROMFILE
  )
}

export function setWindowsWindowIcon(window: WindowWithPtr): void {
  if (getPlatformRuntime() !== 'windows') return

  const iconPath = join(import.meta.dir, '../images/WindowsAppIcon.ico')
  const smallIcon = loadIcon(iconPath, 16)
  const bigIcon = loadIcon(iconPath, 32)

  if (smallIcon) {
    getUser32().SendMessageW(window.ptr, WM_SETICON, ICON_SMALL, smallIcon)
    getUser32().SetClassLongPtrW(window.ptr, GCLP_HICONSM, smallIcon)
  }
  if (bigIcon) {
    getUser32().SendMessageW(window.ptr, WM_SETICON, ICON_BIG, bigIcon)
    getUser32().SetClassLongPtrW(window.ptr, GCLP_HICON, bigIcon)
  }
}
