# Output Formatting with Apple Foundation Models

Codictate can reshape transcribed speech into structured output before pasting it — for example, turning a raw dictation into a properly formatted email with a greeting, body, and sign-off. This is powered entirely on-device using Apple's **FoundationModels** framework, which ships as part of macOS 26 (Tahoe) and requires Apple Intelligence to be enabled.

---

## Requirements

| Requirement | Detail |
|---|---|
| macOS | 26 (Tahoe) or later |
| Apple Intelligence | Must be enabled in **System Settings → Apple Intelligence & Siri** |
| Chip | Apple Silicon (M-series) |

Formatting degrades gracefully: if the binary is missing, the OS version is too old, or Apple Intelligence is disabled, Codictate falls back to pasting the raw transcript unchanged.

---

## Architecture

### The helper binary

Formatting runs in a separate Swift process — `CodictateFormatterHelper` — located at:

- **Dev:** `vendors/formatter/CodictateFormatterHelper`
- **Bundled app:** `Contents/Resources/native-helpers/CodictateFormatterHelper`

The Bun process spawns the helper with `--request <json>`, reads stdout for the formatted result, and falls back to the raw transcript on any non-zero exit code. The helper is rebuilt and vendored by `src/scripts/build-swift.sh`, which runs as part of `bun run start` and `bun run build`.

The source lives at `native/CodictateFormatterHelper/Sources/CodictateFormatterHelper/main.swift`.

### FoundationModels and structured output

The helper uses `FoundationModels.LanguageModelSession` — Apple's public on-device inference API introduced in macOS 26. The underlying model is an approximately 3 billion parameter model that runs locally via XPC; no data leaves the device.

Rather than prompting for free-form text and then parsing it with regex, the formatter uses **constrained structured generation** via the `@Generable` macro:

```swift
@Generable
struct FormattedEmail {
    @Guide(description: "Greeting line only, e.g. \"Hi,\" or \"Hi Sarah,\"")
    var greeting: String

    @Guide(description: "Email body paragraphs — no greeting, no closing")
    var body: String

    @Guide(description: "Closing phrase only, e.g. \"Best regards,\" or \"Thanks,\"")
    var closing: String

    @Guide(description: "Sender name, or empty string if none")
    var senderName: String
}
```

At inference time, `session.respond(to:generating:)` uses constrained token decoding to guarantee the model can only produce output that conforms to this schema. The four fields are filled independently, which prevents bleed-through (e.g. the body accidentally including the closing phrase).

### Prompt engineering for a small model

The on-device model is intentionally small, which has implications for how prompts are written:

- **`@Guide` descriptions are minimal labels** — a single short phrase describing what the field contains. Long descriptions or examples in `@Guide` cause the model to echo the description text as content. All formatting rules belong in the system instructions, not in field descriptions.
- **System instructions are short and direct** — the model performs better with brief imperative sentences than with elaborately worded paragraphs.
- **No language examples in style preferences** — specifying foreign-language examples alongside English ones caused the model to randomly pick a non-English variant even for English input. Style preferences describe only the tone (`"Use a formal, professional closing tone."`), and a single rule in the system prompt handles language matching (`"The greeting and closing MUST be in the same language as the body."`).
- **Stored user name is sender-only context** — the helper tells the model the user's display name only for sign-off handling, explicitly forbids using it as the recipient greeting, and strips it back out of the greeting if it appears there without being dictated in the opening words.

### Context-aware mode selection

Before invoking the helper, the Bun process uses AppleScript via `osascript` to capture the currently focused application (name, bundle ID, window title). This context is included in the prompt:

```
The user is composing in Mail (window: Re: Project update).
```

When **Auto-select in mail apps** is enabled, Codictate also uses this context to automatically switch to email formatting mode when the frontmost app is a recognised mail client (Mail, Outlook, Spark, Superhuman, Mimestream, etc.), regardless of the manually selected mode.

---

## Request / response flow

```
User stops recording
        │
        ▼
speech2text() → raw transcript
        │
        ▼
buildFormatterRequest()
  - resolves effective mode (manual or auto-selected)
  - captures focused app context via AppleScript
  - reads user settings (greeting style, closing style, sender name, etc.)
        │
        ▼
applyFormatting()
  - serialises request to JSON
  - spawns CodictateFormatterHelper --request <json>
  - reads stdout
        │
        ▼
CodictateFormatterHelper
  - checks SystemLanguageModel.default.availability
  - builds system instructions from user preferences
  - calls LanguageModelSession.respond(generating: FormattedEmail.self)
  - assembles fields into final plain-text string
  - writes to stdout
        │
        ▼
Bun reads formatted text → pastes via clipboard
```

If any step fails (binary missing, non-zero exit, empty output), the raw transcript is pasted unchanged.

---

## User-facing settings

Settings are stored in `~/Library/Application Support/codictate/app-config.json`.

| Setting | Key | Default | Description |
|---|---|---|---|
| Format mode | `formattingModeId` | `none` | `none` or `email` |
| Auto-select in mail apps | `formattingAutoSelectEnabled` | `false` | Switches to email mode automatically based on focused app |
| Greeting style | `formattingEmailGreetingStyle` | `auto` | `auto`, `hi`, `hello`, or `custom` |
| Custom greeting | `formattingEmailCustomGreeting` | `""` | Used when style is `custom`; passed through exactly as written |
| Closing style | `formattingEmailClosingStyle` | `auto` | `auto`, `best-regards`, `thanks`, `kind-regards`, or `custom` |
| Custom closing | `formattingEmailCustomClosing` | `""` | Used when style is `custom`; passed through exactly as written |
| Include sender name | `formattingEmailIncludeSenderName` | `false` | Appends the user's display name to the sign-off |
| User display name | `userDisplayName` | `""` | General profile name; used by formatting and future features |

---

## Availability probe

The `--availability` flag exits 0 if FoundationModels is usable on the current device, or 1 with a descriptive message to stderr otherwise. The TypeScript layer calls this at startup to set `formattingAvailable` in app settings, which controls whether the formatting UI is shown or hidden.

```bash
vendors/formatter/CodictateFormatterHelper --availability
```

---

## Building the helper

The helper is a Swift Package. Build and vendor it with:

```bash
# Via the combined build script (also builds MicRecorder and Parakeet):
bun run build:native

# Or directly:
swift build -c release --package-path native/CodictateFormatterHelper
```

`build-swift.sh` copies the release binary to `vendors/formatter/CodictateFormatterHelper` automatically. The `vendors/` directory is committed so the app works without a full Swift build.
