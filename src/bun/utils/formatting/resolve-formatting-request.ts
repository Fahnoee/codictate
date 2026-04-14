import type {
  FocusedAppContext,
  FormattingRuntimeSettings,
} from '../../../shared/types'
import type { FormattingModeId } from '../../../shared/formatting-modes'
import { log } from '../logger'

export interface FormatterRequest {
  modeId: FormattingModeId
  transcript: string
  userDisplayName: string
  emailIncludeSenderName: boolean
  emailGreetingStyle: FormattingRuntimeSettings['formattingEmailGreetingStyle']
  emailClosingStyle: FormattingRuntimeSettings['formattingEmailClosingStyle']
  focusedApp: FocusedAppContext | null
}

const MAIL_APP_NAMES = new Set([
  'mail',
  'microsoft outlook',
  'outlook',
  'spark',
  'spark desktop',
  'superhuman',
  'mimestream',
])

const MAIL_BUNDLE_ID_PREFIXES = [
  'com.apple.mail',
  'com.microsoft.outlook',
  'com.readdle.spark',
  'com.readdle.smartemail',
  'com.superhuman.superhuman',
  'com.mimestream.mimestream',
]

async function runAppleScript(lines: string[]): Promise<string> {
  const args = lines.flatMap((line) => ['-e', line])
  const proc = Bun.spawn(['osascript', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdoutText, stderrText] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  if (proc.exitCode !== 0) {
    throw new Error(stderrText.trim() || 'osascript failed')
  }
  return stdoutText.trim()
}

export async function getFocusedAppContext(): Promise<FocusedAppContext | null> {
  try {
    const raw = await runAppleScript([
      'tell application "System Events"',
      'set frontApp to first application process whose frontmost is true',
      'set appName to name of frontApp',
      'set bundleId to ""',
      'try',
      'set bundleId to bundle identifier of frontApp',
      'end try',
      'set windowTitle to ""',
      'try',
      'set windowTitle to name of front window of frontApp',
      'end try',
      'return appName & linefeed & bundleId & linefeed & windowTitle',
      'end tell',
    ])

    const [appNameRaw, bundleIdentifierRaw, ...titleParts] = raw.split('\n')
    const appName = appNameRaw?.trim()
    if (!appName) return null

    const bundleIdentifier = bundleIdentifierRaw?.trim() || null
    const windowTitle = titleParts.join('\n').trim() || null

    return {
      appName,
      bundleIdentifier,
      windowTitle,
    }
  } catch (error) {
    log('formatter', 'failed to resolve focused app context', {
      error: String(error),
    })
    return null
  }
}

function looksLikeMailApp(focusedApp: FocusedAppContext | null): boolean {
  if (!focusedApp) return false
  const appName = focusedApp.appName.trim().toLowerCase()
  if (MAIL_APP_NAMES.has(appName)) return true
  const bundleIdentifier = focusedApp.bundleIdentifier?.trim().toLowerCase()
  if (!bundleIdentifier) return false
  return MAIL_BUNDLE_ID_PREFIXES.some((prefix) =>
    bundleIdentifier.startsWith(prefix)
  )
}

export async function buildFormatterRequest(
  transcript: string,
  settings: FormattingRuntimeSettings
): Promise<FormatterRequest | null> {
  const focusedApp = settings.formattingAutoSelectEnabled
    ? await getFocusedAppContext()
    : null

  const effectiveModeId: FormattingModeId =
    settings.formattingAutoSelectEnabled && looksLikeMailApp(focusedApp)
      ? 'email'
      : settings.formattingModeId

  if (effectiveModeId === 'none') return null

  return {
    modeId: effectiveModeId,
    transcript,
    userDisplayName: settings.userDisplayName.trim(),
    emailIncludeSenderName: settings.formattingEmailIncludeSenderName,
    emailGreetingStyle: settings.formattingEmailGreetingStyle,
    emailClosingStyle: settings.formattingEmailClosingStyle,
    focusedApp,
  }
}
