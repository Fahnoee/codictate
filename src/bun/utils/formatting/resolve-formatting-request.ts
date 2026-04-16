import type {
  FocusedAppContext,
  FormattingRuntimeSettings,
} from '../../../shared/types'
import {
  FORMATTING_MODE_ORDER,
  type FormattingModeId,
} from '../../../shared/formatting-modes'
import { log } from '../logger'

export interface FormatterRequest {
  /** Master switch: when false, `applyFormatting` must not change the transcript. */
  formattingEnabled: boolean
  modeId: FormattingModeId
  transcript: string
  userDisplayName: string
  // Email
  emailIncludeSenderName: boolean
  emailGreetingStyle: FormattingRuntimeSettings['formattingEmailGreetingStyle']
  emailClosingStyle: FormattingRuntimeSettings['formattingEmailClosingStyle']
  emailCustomGreeting: string
  emailCustomClosing: string
  // iMessage
  imessageTone: FormattingRuntimeSettings['formattingImessageTone']
  imessageAllowEmoji: boolean
  imessageLightweight: boolean
  // Slack
  slackTone: FormattingRuntimeSettings['formattingSlackTone']
  slackAllowEmoji: boolean
  slackUseMarkdown: boolean
  slackLightweight: boolean
  // Document
  documentTone: FormattingRuntimeSettings['formattingDocumentTone']
  documentStructure: FormattingRuntimeSettings['formattingDocumentStructure']
  documentLightweight: boolean
  focusedApp: FocusedAppContext | null
}

interface AppDetector {
  names: Set<string>
  bundlePrefixes: string[]
}

const APP_DETECTORS: Record<FormattingModeId, AppDetector> = {
  email: {
    names: new Set([
      'mail',
      'microsoft outlook',
      'outlook',
      'spark',
      'spark desktop',
      'superhuman',
      'mimestream',
    ]),
    bundlePrefixes: [
      'com.apple.mail',
      'com.microsoft.outlook',
      'com.readdle.spark',
      'com.readdle.smartemail',
      'com.superhuman.superhuman',
      'com.mimestream.mimestream',
    ],
  },
  imessage: {
    names: new Set(['messages']),
    bundlePrefixes: ['com.apple.mobilesms', 'com.apple.messages'],
  },
  slack: {
    names: new Set(['slack']),
    bundlePrefixes: ['com.tinyspeck.slackmacgap', 'com.slack'],
  },
  document: {
    names: new Set([
      'notes',
      'pages',
      'microsoft word',
      'word',
      'google docs',
      'ulysses',
      'bear',
    ]),
    bundlePrefixes: [
      'com.apple.notes',
      'com.apple.iwork.pages',
      'com.microsoft.word',
      'com.ulyssesapp.mac',
      'net.shinyfrog.bear',
    ],
  },
}

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

function appMatchesMode(
  mode: FormattingModeId,
  focusedApp: FocusedAppContext | null
): boolean {
  if (!focusedApp) return false
  const detector = APP_DETECTORS[mode]
  const appName = focusedApp.appName.trim().toLowerCase()
  if (detector.names.has(appName)) return true
  const bundleIdentifier = focusedApp.bundleIdentifier?.trim().toLowerCase()
  if (!bundleIdentifier) return false
  return detector.bundlePrefixes.some((prefix) =>
    bundleIdentifier.startsWith(prefix)
  )
}

function buildRequest(
  modeId: FormattingModeId,
  transcript: string,
  settings: FormattingRuntimeSettings,
  focusedApp: FocusedAppContext | null
): FormatterRequest {
  return {
    formattingEnabled: settings.formattingEnabled,
    modeId,
    transcript,
    userDisplayName: settings.userDisplayName.trim(),
    emailIncludeSenderName: settings.formattingEmailIncludeSenderName,
    emailGreetingStyle: settings.formattingEmailGreetingStyle,
    emailClosingStyle: settings.formattingEmailClosingStyle,
    emailCustomGreeting: settings.formattingEmailCustomGreeting,
    emailCustomClosing: settings.formattingEmailCustomClosing,
    imessageTone: settings.formattingImessageTone,
    imessageAllowEmoji: settings.formattingImessageAllowEmoji,
    imessageLightweight: settings.formattingImessageLightweight,
    slackTone: settings.formattingSlackTone,
    slackAllowEmoji: settings.formattingSlackAllowEmoji,
    slackUseMarkdown: settings.formattingSlackUseMarkdown,
    slackLightweight: settings.formattingSlackLightweight,
    documentTone: settings.formattingDocumentTone,
    documentStructure: settings.formattingDocumentStructure,
    documentLightweight: settings.formattingDocumentLightweight,
    focusedApp,
  }
}

export async function buildFormatterRequest(
  transcript: string,
  settings: FormattingRuntimeSettings
): Promise<FormatterRequest | null> {
  if (!settings.formattingEnabled) return null

  // Tray force-override: skip app detection, apply the chosen mode directly.
  // Still requires that format's per-mode toggle (same as auto-detect).
  if (settings.formattingForceModeId !== null) {
    const forced = settings.formattingForceModeId
    if (!(settings.formattingEnabledModes[forced] ?? false)) {
      return null
    }
    const focusedApp = await getFocusedAppContext()
    return buildRequest(forced, transcript, settings, focusedApp)
  }

  const focusedApp = await getFocusedAppContext()
  for (const modeId of FORMATTING_MODE_ORDER) {
    if (!settings.formattingEnabledModes[modeId]) continue
    if (appMatchesMode(modeId, focusedApp)) {
      return buildRequest(modeId, transcript, settings, focusedApp)
    }
  }

  return null
}
