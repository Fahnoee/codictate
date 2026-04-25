import type {
  FocusedAppContext,
  FormatterModelTier,
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
  /** Transcription language ID ('da', 'zh-cn', 'auto', …). Used by the formatter for locale hints. */
  transcriptionLanguage: string
  userDisplayName: string
  formatterModelTier: FormatterModelTier
  // Email
  emailIncludeSenderName: boolean
  emailGreetingStyle: FormattingRuntimeSettings['email']['greetingStyle']
  emailClosingStyle: FormattingRuntimeSettings['email']['closingStyle']
  emailCustomGreeting: string
  emailCustomClosing: string
  // iMessage
  imessageTone: FormattingRuntimeSettings['imessage']['tone']
  imessageAllowEmoji: boolean
  imessageLightweight: boolean
  // Slack
  slackTone: FormattingRuntimeSettings['slack']['tone']
  slackAllowEmoji: boolean
  slackUseMarkdown: boolean
  slackLightweight: boolean
  // Document
  documentTone: FormattingRuntimeSettings['document']['tone']
  documentStructure: FormattingRuntimeSettings['document']['structure']
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
    formattingEnabled: settings.enabled,
    modeId,
    transcript,
    transcriptionLanguage: settings.transcriptionLanguageId,
    userDisplayName: settings.userDisplayName.trim(),
    formatterModelTier: settings.formatterModelTier,
    emailIncludeSenderName: settings.email.includeSenderName,
    emailGreetingStyle: settings.email.greetingStyle,
    emailClosingStyle: settings.email.closingStyle,
    emailCustomGreeting: settings.email.customGreeting,
    emailCustomClosing: settings.email.customClosing,
    imessageTone: settings.imessage.tone,
    imessageAllowEmoji: settings.imessage.allowEmoji,
    imessageLightweight: settings.imessage.lightweight,
    slackTone: settings.slack.tone,
    slackAllowEmoji: settings.slack.allowEmoji,
    slackUseMarkdown: settings.slack.useMarkdown,
    slackLightweight: settings.slack.lightweight,
    documentTone: settings.document.tone,
    documentStructure: settings.document.structure,
    documentLightweight: settings.document.lightweight,
    focusedApp,
  }
}

export async function buildFormatterRequest(
  transcript: string,
  settings: FormattingRuntimeSettings
): Promise<FormatterRequest | null> {
  // Force mode bypasses both the master switch and per-mode toggles.
  if (settings.forceModeId !== null) {
    const focusedApp = await getFocusedAppContext()
    log('formatter', 'force mode active', {
      forceModeId: settings.forceModeId,
      focusedApp: focusedApp?.appName,
    })
    return buildRequest(settings.forceModeId, transcript, settings, focusedApp)
  }

  if (!settings.enabled) {
    log('formatter', 'skip: master switch off')
    return null
  }

  const focusedApp = await getFocusedAppContext()
  for (const modeId of FORMATTING_MODE_ORDER) {
    if (!settings.enabledModes[modeId]) continue
    if (appMatchesMode(modeId, focusedApp)) {
      log('formatter', 'matched mode', {
        modeId,
        focusedApp: focusedApp?.appName,
      })
      return buildRequest(modeId, transcript, settings, focusedApp)
    }
  }

  log('formatter', 'skip: no enabled mode matches focused app', {
    focusedApp: focusedApp?.appName,
    bundleIdentifier: focusedApp?.bundleIdentifier,
    enabledModes: settings.enabledModes,
  })
  return null
}
