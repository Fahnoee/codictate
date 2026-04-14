import Foundation
import FoundationModels

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
    fputs("Usage: CodictateFormatterHelper --availability | <mode> <text>\n", stderr)
    exit(1)
}

let mode = CommandLine.arguments[1]
let inputText = CommandLine.arguments[2...]
    .joined(separator: " ")
    .trimmingCharacters(in: .whitespacesAndNewlines)

guard !inputText.isEmpty else {
    fputs("[formatter] empty input text\n", stderr)
    exit(1)
}

let prompt: String
switch mode {
case "email":
    prompt = """
    Convert the transcribed speech below into a complete, polished email body.

    You must always output a real email body, even if the transcription is short or rough.

    Required structure:
    1. A greeting on its own line.
    2. A blank line.
    3. The message body with clean sentences and paragraph spacing.
    4. A blank line.
    5. A brief closing line and sign-off on its own line.

    Rules:
    - Preserve the user's meaning, requests, names, dates, and factual content.
    - Fix transcription errors, punctuation, capitalization, and spacing.
    - If no recipient name is given, use "Hi,".
    - If no closing is implied, add a natural generic sign-off such as "Best regards."
    - Do not include a subject line.
    - Do not add placeholder names.
    - Output only the final email body.

    Example input:
    can you send over the final invoice by friday thanks

    Example output:
    Hi,

    Can you send over the final invoice by Friday?

    Thanks!

    Example input:
    hi sarah just wanted to confirm that we're still on for tomorrow at 3 pm let me know if anything changes

    Example output:
    Hi Sarah,

    Just wanted to confirm that we're still on for tomorrow at 3 PM. Let me know if anything changes.

    Best regards.
    
    

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
        let session = LanguageModelSession()
        let response = try await session.respond(to: prompt)
        print(response.content)
        exit(0)
    } catch {
        fputs("[formatter] FoundationModels error: \(error.localizedDescription)\n", stderr)
        exit(1)
    }
}

RunLoop.main.run()
