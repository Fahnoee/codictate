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
    let emailIncludeSenderName: Bool
    let emailGreetingStyle: String
    let emailClosingStyle: String
    let emailCustomGreeting: String?
    let emailCustomClosing: String?
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
        - If the dictation already ends with a name or signature, keep that name in senderName.
        - Otherwise set senderName to "\(name)".
        """
    } else if !name.isEmpty {
        return """
        Sender name:
        - The user's name is "\(name)" — do NOT append it automatically.
        - Set senderName to an empty string unless the dictation itself clearly ends with a name.
        """
    } else {
        return "Sender name: set senderName to an empty string unless the dictation itself clearly ends with a name."
    }
}

/// Assembles the four structured fields into the final plain-text email body.
/// `forcedSenderName` is appended when the model outputs an empty senderName but
/// the user has explicitly requested their name in the sign-off.
func assembleEmail(_ email: FormattedEmail, forcedSenderName: String = "") -> String {
    let greeting = email.greeting.trimmingCharacters(in: .whitespacesAndNewlines)
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
        print(assembleEmail(response.content, forcedSenderName: forcedSender))
        exit(0)
    } catch {
        fputs("[formatter] FoundationModels error: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}
