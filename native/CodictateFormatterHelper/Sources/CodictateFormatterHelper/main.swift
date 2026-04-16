import Foundation
import FoundationModels

// MARK: - Input types

struct FocusedAppContext: Decodable {
    let appName: String
    let bundleIdentifier: String?
    let windowTitle: String?
}

struct FormatterRequest: Decodable {
    let modeId: String
    let transcript: String
    let userDisplayName: String
    // Email
    let emailIncludeSenderName: Bool
    let emailGreetingStyle: String
    let emailClosingStyle: String
    let emailCustomGreeting: String?
    let emailCustomClosing: String?
    // iMessage (all optional for backward compatibility with older callers)
    let imessageTone: String?
    let imessageAllowEmoji: Bool?
    // Slack
    let slackTone: String?
    let slackAllowEmoji: Bool?
    let slackUseMarkdown: Bool?
    // Document
    let documentTone: String?
    let documentStructure: String?
    let focusedApp: FocusedAppContext?
}

// MARK: - Structured output
//
// @Generable guarantees the model populates each field independently.
// Constrained decoding at the token level makes it impossible for the
// model to bleed the closing into the body or forget the greeting.

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

@Generable
struct FormattedIMessage {
    @Guide(description: "The rewritten Messages text. Single message, no greeting or sign-off.")
    var message: String
}

@Generable
struct FormattedSlack {
    @Guide(description: "The rewritten Slack message body. No greeting or sign-off.")
    var message: String
}

@Generable
struct FormattedDocument {
    @Guide(description: "Optional short title. Empty string if no title is warranted.")
    var title: String

    @Guide(description: "The polished document body. Plain text. Paragraphs separated by blank lines.")
    var body: String
}

// MARK: - CLI entry point

func ensureAvailabilityOrExit() {
    switch SystemLanguageModel.default.availability {
    case .available:
        return
    case .unavailable(let reason):
        switch reason {
        case .deviceNotEligible:
            fputs("[formatter] Apple Intelligence is not supported on this device\n", stderr)
        case .appleIntelligenceNotEnabled:
            fputs("[formatter] Apple Intelligence is not enabled — enable it in System Settings → Apple Intelligence & Siri\n", stderr)
        default:
            fputs("[formatter] Apple Intelligence is not available: \(reason)\n", stderr)
        }
        exit(1)
    @unknown default:
        exit(1)
    }
}

// CLI:
//   CodictateFormatterHelper --availability
//   CodictateFormatterHelper --request <json>
//   CodictateFormatterHelper <mode> <text...>
//
// Exit codes:
//   0  — availability probe succeeded, or formatting succeeded
//   1  — usage error or formatting failed (TypeScript bridge falls back to raw text)

if CommandLine.arguments.count == 2, CommandLine.arguments[1] == "--availability" {
    ensureAvailabilityOrExit()
    exit(0)
}

guard CommandLine.arguments.count >= 3 else {
    fputs("Usage: CodictateFormatterHelper --availability | --request <json> | <mode> <text>\n", stderr)
    exit(1)
}

let request: FormatterRequest
if CommandLine.arguments.count == 3, CommandLine.arguments[1] == "--request" {
    let raw = CommandLine.arguments[2]
    guard let data = raw.data(using: .utf8) else {
        fputs("[formatter] invalid request encoding\n", stderr)
        exit(1)
    }
    do {
        request = try JSONDecoder().decode(FormatterRequest.self, from: data)
    } catch {
        fputs("[formatter] failed to decode request JSON: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
} else {
    request = FormatterRequest(
        modeId: CommandLine.arguments[1],
        transcript: CommandLine.arguments[2...].joined(separator: " "),
        userDisplayName: "",
        emailIncludeSenderName: false,
        emailGreetingStyle: "auto",
        emailClosingStyle: "auto",
        emailCustomGreeting: nil,
        emailCustomClosing: nil,
        imessageTone: nil,
        imessageAllowEmoji: nil,
        slackTone: nil,
        slackAllowEmoji: nil,
        slackUseMarkdown: nil,
        documentTone: nil,
        documentStructure: nil,
        focusedApp: nil
    )
}

let mode = request.modeId
let inputText = request.transcript.trimmingCharacters(in: .whitespacesAndNewlines)

guard !inputText.isEmpty else {
    fputs("[formatter] empty input text\n", stderr)
    exit(1)
}

// FoundationModels uses XPC internally — the main RunLoop must be kept pumping
// so that XPC callbacks are delivered. Call exit() from the Task when done.
Task {
    ensureAvailabilityOrExit()

    switch mode {
    case "email":
        await formatEmail(request: request, inputText: inputText)
    case "imessage":
        await formatIMessage(request: request, inputText: inputText)
    case "slack":
        await formatSlack(request: request, inputText: inputText)
    case "document":
        await formatDocument(request: request, inputText: inputText)
    default:
        fputs("[formatter] unknown mode: \(mode)\n", stderr)
        exit(1)
    }
}

RunLoop.main.run()

// MARK: - Email formatting

func greetingPreference(_ style: String, custom: String?) -> String {
    switch style {
    case "hi":     return "Use an informal greeting tone."
    case "hello":  return "Use a formal greeting tone."
    case "custom":
        let text = custom?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !text.isEmpty {
            return "Use \"\(text)\" as the greeting word or phrase exactly as written."
        }
        return "Choose the most natural greeting."
    default:       return "Choose the most natural greeting."
    }
}

func closingPreference(_ style: String, custom: String?) -> String {
    switch style {
    case "best-regards":  return "Use a formal, professional closing tone."
    case "thanks":        return "Use a grateful closing tone."
    case "kind-regards":  return "Use a warm, friendly closing tone."
    case "custom":
        let text = custom?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !text.isEmpty {
            return "Use \"\(text)\" as the closing phrase exactly as written."
        }
        return "Choose the most natural closing."
    default:              return "Choose the most natural closing."
    }
}

func senderGuidance(name: String, include: Bool) -> String {
    if !name.isEmpty && include {
        return """
        Sender name:
        - The user's name is "\(name)".
        - This name refers to the sender only, NEVER the recipient.
        - NEVER use the user's name in greeting unless the speech itself explicitly opened with that exact name.
        - If the dictation already ends with a name or signature, keep that name in senderName.
        - Otherwise set senderName to "\(name)".
        """
    } else if !name.isEmpty {
        return """
        Sender name:
        - The user's name is "\(name)" — do NOT append it automatically.
        - This name refers to the sender only, NEVER the recipient.
        - NEVER use the user's name in greeting unless the speech itself explicitly opened with that exact name.
        - Set senderName to an empty string unless the dictation itself clearly ends with a name.
        """
    } else {
        return "Sender name: set senderName to an empty string unless the dictation itself clearly ends with a name."
    }
}

func normaliseForComparison(_ text: String) -> String {
    let folded = text.folding(
        options: [.caseInsensitive, .diacriticInsensitive],
        locale: .current
    )
    let scalars = folded.unicodeScalars.map { scalar -> Character in
        CharacterSet.alphanumerics.contains(scalar) ? Character(scalar) : " "
    }
    return String(scalars)
        .split(whereSeparator: \.isWhitespace)
        .joined(separator: " ")
}

func transcriptExplicitlyOpensWithName(_ transcript: String, senderName: String) -> Bool {
    let name = normaliseForComparison(senderName)
    guard !name.isEmpty else { return false }

    let prefix = String(transcript.prefix(120))
    let normalisedPrefix = normaliseForComparison(prefix)
    guard normalisedPrefix.contains(name) else { return false }

    let salutationHints = [
        "hi ", "hello ", "hey ", "dear ", "hej ", "hejsa ", "hola ", "bonjour ",
    ]
    return salutationHints.contains { hint in
        normalisedPrefix.contains(hint + name)
    }
}

func sanitiseGreeting(_ greeting: String, senderName: String, transcript: String) -> String {
    let trimmedGreeting = greeting.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedSenderName = senderName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedGreeting.isEmpty, !trimmedSenderName.isEmpty else {
        return trimmedGreeting
    }
    guard !transcriptExplicitlyOpensWithName(transcript, senderName: trimmedSenderName) else {
        return trimmedGreeting
    }

    let normalisedGreeting = normaliseForComparison(trimmedGreeting)
    let normalisedSenderName = normaliseForComparison(trimmedSenderName)
    guard normalisedGreeting.contains(normalisedSenderName) else {
        return trimmedGreeting
    }

    var cleaned = trimmedGreeting.replacingOccurrences(
        of: trimmedSenderName,
        with: "",
        options: [.caseInsensitive, .diacriticInsensitive],
        range: nil
    )
    while cleaned.contains("  ") {
        cleaned = cleaned.replacingOccurrences(of: "  ", with: " ")
    }
    cleaned = cleaned.replacingOccurrences(of: " ,", with: ",")
    cleaned = cleaned.replacingOccurrences(of: " .", with: ".")
    cleaned = cleaned.replacingOccurrences(of: " !", with: "!")
    cleaned = cleaned.replacingOccurrences(of: " ?", with: "?")
    return cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
}

/// Assembles the four structured fields into the final plain-text email body.
/// `forcedSenderName` is appended when the model outputs an empty senderName but
/// the user has explicitly requested their name in the sign-off.
func assembleEmail(
    _ email: FormattedEmail,
    forcedSenderName: String = "",
    userDisplayName: String = "",
    originalTranscript: String = ""
) -> String {
    let greeting = sanitiseGreeting(
        email.greeting,
        senderName: userDisplayName,
        transcript: originalTranscript
    )
    let body     = email.body.trimmingCharacters(in: .whitespacesAndNewlines)
    let modelSender = email.senderName.trimmingCharacters(in: .whitespacesAndNewlines)
    let senderName  = modelSender.isEmpty ? forcedSenderName : modelSender

    // Normalise closing: ensure it ends with exactly one comma.
    var closing = email.closing.trimmingCharacters(in: .whitespacesAndNewlines)
    if !closing.isEmpty {
        if closing.hasSuffix(".") || closing.hasSuffix(":") {
            closing = String(closing.dropLast()) + ","
        } else if let last = closing.last, !",!?".contains(last) {
            closing += ","
        }
    }

    var parts: [String] = []
    if !greeting.isEmpty { parts.append(greeting) }
    if !body.isEmpty {
        parts.append("")   // blank line after greeting
        parts.append(body)
    }
    if !closing.isEmpty {
        parts.append("")   // blank line before closing
        parts.append(closing)
    }
    if !senderName.isEmpty {
        parts.append(senderName)  // no blank line between closing and name
    }

    return parts.joined(separator: "\n")
}

func formatEmail(request: FormatterRequest, inputText: String) async {
    let senderName = request.userDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)

    let focusedAppLine: String = {
        guard let app = request.focusedApp else { return "" }
        var s = "The user is composing in \(app.appName)"
        if let title = app.windowTitle, !title.isEmpty { s += " (window: \(title))" }
        return s + "."
    }()

    // System instructions are kept short on purpose.
    // The 3B on-device model performs better with brief, direct commands.
    // The @Generable schema is injected by the framework on top of these instructions.
    let instructions = """
    You format transcribed speech into email fields.

    Rules:
    - Keep the input language. NEVER translate.
    - NEVER add content that was not in the speech.
    - Fix grammar, punctuation, and capitalisation. Preserve meaning and names.
    - The greeting and closing MUST be in the same language as the body.
    - The user's stored display name is sender context only. NEVER treat it as the recipient name.

    greeting: Extract the opening words if they are a salutation \
    (hi, hello, hey, dear, hej, hola, bonjour, etc.) optionally followed by a name. \
    End with a comma. If none was spoken, generate one. \
    \(greetingPreference(request.emailGreetingStyle, custom: request.emailCustomGreeting))

    body: Everything between the greeting and the closing. \
    Fix run-on sentences. Capitalise the first word. Separate paragraphs with a blank line.

    closing: If the speech ends with a farewell phrase (such as best regards, \
    kind regards, thanks, cheers, mvh, or an equivalent in the input language), \
    extract it. Otherwise generate a closing. \
    \(closingPreference(request.emailClosingStyle, custom: request.emailCustomClosing))

    \(senderGuidance(name: senderName, include: request.emailIncludeSenderName))
    """

    var promptParts: [String] = []
    if !focusedAppLine.isEmpty { promptParts.append(focusedAppLine) }
    promptParts.append("Convert this transcribed speech into a formatted email:\n\n\(inputText)")
    let prompt = promptParts.joined(separator: "\n\n")

    do {
        let options = GenerationOptions(temperature: 0.1)
        let session = LanguageModelSession(instructions: instructions)
        let response = try await session.respond(
            to: prompt,
            generating: FormattedEmail.self,
            options: options
        )
        let forcedSender = request.emailIncludeSenderName ? senderName : ""
        print(assembleEmail(
            response.content,
            forcedSenderName: forcedSender,
            userDisplayName: senderName,
            originalTranscript: inputText
        ))
        exit(0)
    } catch {
        fputs("[formatter] FoundationModels error: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}

// MARK: - Messages formatting

func imessageToneGuidance(_ tone: String) -> String {
    switch tone {
    case "formal":
        return "Polish more: clear punctuation, proper capitalization, complete sentences. Keep wording faithful to what was said."
    case "neutral":
        return "Light polish only: fix obvious grammar and spacing. Keep phrasing very close to the transcript—avoid rephrasing or changing vibe."
    default:
        return "Minimal polish: only fix what is unclear or broken. Preserve casual fragments, fillers, and word choice unless the meaning suffers."
    }
}

func slackToneGuidance(_ tone: String) -> String {
    switch tone {
    case "professional":
        return "Stronger polish: crisp, professional team-chat tone with clear punctuation."
    case "neutral":
        return "Light polish only: fix obvious grammar and spacing. Stay very close to the transcript—avoid rephrasing."
    default:
        return "Minimal polish: only fix what is unclear. Preserve informal phrasing and fragments when they still read clearly."
    }
}

func formatIMessage(request: FormatterRequest, inputText: String) async {
    let tone = request.imessageTone ?? "neutral"
    let allowEmoji = request.imessageAllowEmoji ?? true
    let emojiRule = allowEmoji
        ? "You MAY include at most ONE emoji, only if it clearly fits the mood. Never use more than one."
        : "Do NOT include any emoji."

    let instructions = """
    You rewrite transcribed speech into a short Messages text.

    Rules:
    - Keep the input language. NEVER translate.
    - NEVER add content that was not in the speech.
    - Produce ONE message only. No greeting. No sign-off. No quoted replies.
    - Fix grammar, punctuation, capitalisation. Preserve meaning and names.
    - Keep it short and natural — contractions are fine ("I'm", "don't").
    - \(imessageToneGuidance(tone))
    - \(emojiRule)
    """

    let prompt = "Rewrite this speech as a single Messages text:\n\n\(inputText)"

    do {
        let options = GenerationOptions(temperature: 0.2)
        let session = LanguageModelSession(instructions: instructions)
        let response = try await session.respond(
            to: prompt,
            generating: FormattedIMessage.self,
            options: options
        )
        let out = response.content.message.trimmingCharacters(in: .whitespacesAndNewlines)
        print(out.isEmpty ? inputText : out)
        exit(0)
    } catch {
        fputs("[formatter] FoundationModels error: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}

// MARK: - Slack formatting

func formatSlack(request: FormatterRequest, inputText: String) async {
    let tone = request.slackTone ?? "professional"
    let allowEmoji = request.slackAllowEmoji ?? true
    let useMarkdown = request.slackUseMarkdown ?? true
    let emojiLine = allowEmoji
        ? "You may include 0 or 1 Slack-style `:shortcode:` emoji when it adds meaning. Never more than one."
        : "Do NOT include any emoji."
    let markdownLine = useMarkdown
        ? "You may use Slack markdown: *bold*, _italic_, `code`, short bullet lists with `- `. Use sparingly."
        : "Do NOT use any markdown. Plain text only."

    let instructions = """
    You rewrite transcribed speech into a polished Slack message.

    Rules:
    - Keep the input language. NEVER translate.
    - NEVER add content that was not in the speech.
    - Produce one message. No greeting, no sign-off.
    - Fix grammar, punctuation, capitalisation. Preserve meaning and names.
    - Tight paragraphs separated by a single blank line when there is more than one idea.
    - \(slackToneGuidance(tone))
    - \(markdownLine)
    - \(emojiLine)
    """

    let prompt = "Rewrite this speech as a Slack message:\n\n\(inputText)"

    do {
        let options = GenerationOptions(temperature: 0.15)
        let session = LanguageModelSession(instructions: instructions)
        let response = try await session.respond(
            to: prompt,
            generating: FormattedSlack.self,
            options: options
        )
        let out = response.content.message.trimmingCharacters(in: .whitespacesAndNewlines)
        print(out.isEmpty ? inputText : out)
        exit(0)
    } catch {
        fputs("[formatter] FoundationModels error: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}

// MARK: - Document formatting

func documentToneGuidance(_ tone: String) -> String {
    switch tone {
    case "formal":
        return "Stronger polish: formal, precise prose with polished wording and full sentence punctuation."
    case "casual":
        return "Minimal polish: warm, relaxed tone—keep edits light and stay close to how it was spoken."
    default:
        return "Light polish only: clear notes or draft tone. Fix grammar and flow without rewriting the author's voice."
    }
}

func formatDocument(request: FormatterRequest, inputText: String) async {
    let tone = request.documentTone ?? "neutral"
    let structure = request.documentStructure ?? "prose"
    let structureLine = structure == "bulleted"
        ? "Prefer a bulleted list using \"- \" when the content naturally lists items. Otherwise short paragraphs."
        : "Prefer flowing prose with short paragraphs separated by a blank line. Only use bullets when the speech itself listed items."

    let instructions = """
    You rewrite transcribed speech into a polished plain-text document.

    Rules:
    - Keep the input language. NEVER translate.
    - NEVER add content that was not in the speech.
    - No greeting, no sign-off. No meta-commentary.
    - Fix grammar, punctuation, capitalisation. Preserve meaning and names.
    - Keep the speaker's voice. Do not rewrite the author's style.
    - \(documentToneGuidance(tone))
    - \(structureLine)
    - title: empty string unless the speech itself suggests an obvious heading.
    - body: the full rewritten content. Must not repeat the title.
    """

    let prompt = "Rewrite this dictation as a polished document body:\n\n\(inputText)"

    do {
        let options = GenerationOptions(temperature: 0.15)
        let session = LanguageModelSession(instructions: instructions)
        let response = try await session.respond(
            to: prompt,
            generating: FormattedDocument.self,
            options: options
        )
        let title = response.content.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = response.content.body.trimmingCharacters(in: .whitespacesAndNewlines)
        let combined: String
        if !title.isEmpty && !body.isEmpty {
            combined = "\(title)\n\n\(body)"
        } else if !body.isEmpty {
            combined = body
        } else {
            combined = inputText
        }
        print(combined)
        exit(0)
    } catch {
        fputs("[formatter] FoundationModels error: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}
