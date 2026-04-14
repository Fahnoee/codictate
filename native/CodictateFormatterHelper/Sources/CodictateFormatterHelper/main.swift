import Foundation
import FoundationModels

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
    let focusedApp: FocusedAppContext?
}

// CLI:
//   CodictateFormatterHelper --availability
//   CodictateFormatterHelper <mode> <text...>
//
// Formats transcribed speech text using Apple's on-device FoundationModels (macOS 26+).
// Requires Apple Intelligence to be available and enabled on the device.
//
// Exit codes:
//   0  — availability probe succeeded, or formatting succeeded
//   1  — usage error or formatting failed (TypeScript bridge falls back to raw text)

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
        focusedApp: nil
    )
}

let mode = request.modeId
let inputText = request.transcript.trimmingCharacters(in: .whitespacesAndNewlines)

guard !inputText.isEmpty else {
    fputs("[formatter] empty input text\n", stderr)
    exit(1)
}

func emailGreetingPreferenceLabel(_ style: String) -> String {
    switch style {
    case "hi":
        return "Prefer a warm, simple greeting equivalent to \"Hi\" in the source language."
    case "hello":
        return "Prefer a slightly more formal greeting equivalent to \"Hello\" in the source language."
    default:
        return "Choose the most natural greeting for the source language and tone."
    }
}

func emailClosingPreferenceLabel(_ style: String) -> String {
    switch style {
    case "best-regards":
        return "Prefer a polite closing equivalent to \"Best regards\" in the source language."
    case "thanks":
        return "Prefer a warm closing equivalent to \"Thanks\" in the source language."
    case "kind-regards":
        return "Prefer a formal closing equivalent to \"Kind regards\" in the source language."
    default:
        return "Choose the most natural closing for the source language and tone."
    }
}

func normalizedSingleLine(_ text: String) -> String {
    text
        .replacingOccurrences(of: "\n", with: " ")
        .replacingOccurrences(of: "\r", with: " ")
        .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

func ensureTrailingComma(_ text: String) -> String {
    let trimmed = normalizedSingleLine(text)
    guard !trimmed.isEmpty else { return trimmed }
    if let last = trimmed.last, [",", "!", "?", ".", ":"].contains(last) {
        if last == "." || last == ":" {
            return String(trimmed.dropLast()) + ","
        }
        return trimmed
    }
    return trimmed + ","
}

func normalizedBody(_ text: String) -> String {
    text
        .replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n")
        .replacingOccurrences(of: #"[ \t]+"#, with: " ", options: .regularExpression)
        .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

func normalizeEmailOutput(_ text: String) -> String {
    var output = text
        .replacingOccurrences(of: "\r\n", with: "\n")
        .replacingOccurrences(of: "\r", with: "\n")
        .trimmingCharacters(in: .whitespacesAndNewlines)

    output = output.replacingOccurrences(
        of: #"\n{3,}"#,
        with: "\n\n",
        options: .regularExpression
    )

    let lines = output.components(separatedBy: "\n")
    if lines.count >= 4 {
        let maybeClosingIndex = lines.count - 2
        let maybeNameIndex = lines.count - 1
        let closing = normalizedSingleLine(lines[maybeClosingIndex])
        let sender = normalizedSingleLine(lines[maybeNameIndex])
        if !closing.isEmpty && !sender.isEmpty {
            var rebuilt = Array(lines.dropLast(2))
            while rebuilt.last == "" {
                rebuilt.removeLast()
            }
            rebuilt.append("")
            rebuilt.append(ensureTrailingComma(closing))
            rebuilt.append(sender)
            output = rebuilt.joined(separator: "\n")
        }
    }

    return output.trimmingCharacters(in: .whitespacesAndNewlines)
}

func preferredGreetingExample(_ style: String) -> String {
    switch style {
    case "hello":
        return "Hello,"
    default:
        return "Hi,"
    }
}

func preferredClosingExample(_ style: String) -> String {
    switch style {
    case "thanks":
        return "Thanks,"
    case "kind-regards":
        return "Kind regards,"
    default:
        return "Best regards,"
    }
}

let prompt: String
switch mode {
case "email":
    let senderName = request.userDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
    let greetingExample = preferredGreetingExample(request.emailGreetingStyle)
    let closingExample = preferredClosingExample(request.emailClosingStyle)
    let exampleSenderLine =
        (!senderName.isEmpty && request.emailIncludeSenderName) ? "\n\(senderName)" : ""
    let senderNameGuidance: String = {
        if !senderName.isEmpty && request.emailIncludeSenderName {
            return """
            - The stored sender name is "\(senderName)".
            - If the spoken input already clearly includes a sender name or signature, keep that and do not append the stored name again.
            - If the email needs a sign-off and no sender name was dictated, append "\(senderName)" on the line directly below the closing.
            """
        } else if !senderName.isEmpty {
            return """
            - The stored sender name is "\(senderName)".
            - Do not append it automatically, but you may use it to understand who the sender is.
            """
        } else {
            return """
            - Do not append a sender name unless the spoken input itself clearly includes one.
            """
        }
    }()

    let focusedAppGuidance: String
    if let focusedApp = request.focusedApp {
        focusedAppGuidance = """
        Focused app context:
        - App name: \(focusedApp.appName)
        - Bundle identifier: \(focusedApp.bundleIdentifier ?? "unknown")
        - Focused window title: \(focusedApp.windowTitle ?? "unknown")
        """
    } else {
        focusedAppGuidance = "Focused app context: unavailable."
    }

    prompt = """
    Convert the transcribed speech below into a polished email body.

    Rules:
    - Keep the same language as the input. Never translate.
    - Preserve the user's actual meaning and details.
    - Output only the final email body.
    - If the dictation starts with an inline greeting like "hi", "hello", "hey", or "hej" and then continues directly into the message, split that into a greeting line and a body paragraph.
    - If a greeting is missing, add one.
    - If a closing is missing, add one.
    - If the user already dictated a greeting or closing, preserve it in polished form.
    - If no recipient name is given, use a natural greeting without inventing a recipient name.
    - Keep exactly one blank line after the greeting.
    - Keep exactly one blank line before the closing.
    - If a sender name is present, put it on the very next line after the closing, with no blank line between them.
    - \(emailGreetingPreferenceLabel(request.emailGreetingStyle))
    - \(emailClosingPreferenceLabel(request.emailClosingStyle))
    - \(senderNameGuidance)

    \(focusedAppGuidance)

    Format example:
    \(greetingExample)

    This is the body of the email.

    \(closingExample)\(exampleSenderLine)

    Transcribed speech:
    \(inputText)
    """
default:
    fputs("[formatter] unknown mode: \(mode)\n", stderr)
    exit(1)
}

// FoundationModels uses XPC internally — the main RunLoop must be kept pumping
// so that XPC callbacks are delivered. Call exit() from the Task when done.
Task {
    ensureAvailabilityOrExit()

    do {
        let instructions = """
        You format dictated text into faithful email bodies.
        Keep the user's meaning, keep the same language, and avoid adding content that was not implied.
        """
        let options = GenerationOptions(temperature: 0.1)
        let session = LanguageModelSession(instructions: instructions)
        let response = try await session.respond(to: prompt, options: options)
        print(normalizeEmailOutput(response.content))
        exit(0)
    } catch {
        fputs("[formatter] FoundationModels error: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}

RunLoop.main.run()
