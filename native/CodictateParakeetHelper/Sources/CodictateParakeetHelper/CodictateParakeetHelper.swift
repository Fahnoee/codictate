@preconcurrency import AVFoundation
import Darwin
import FluidAudio
import Foundation

// MARK: - Helpers

private func logPhase(_ msg: String) {
  let line = "[CodictateParakeetHelper] \(msg)\n"
  FileHandle.standardError.write(Data(line.utf8))
  fflush(__stderrp)
}

private func emitJSON(_ obj: [String: Any]) {
  var data = try! JSONSerialization.data(withJSONObject: obj)
  data.append(0x0a)
  FileHandle.standardOutput.write(data)
  fflush(__stdoutp)
}

private func usage() -> Never {
  let msg = """
    Usage:
      CodictateParakeetHelper transcribe <wavPath> <parakeetModelDir>
      CodictateParakeetHelper stream <vad|live> <parakeetModelDir>
    """
  FileHandle.standardError.write(Data(msg.utf8))
  FileHandle.standardError.write(Data([0x0a]))
  exit(2)
}

private func loadAsrModels(parakeetDir: URL) async throws -> AsrModels {
  let cfg = AsrModels.defaultConfiguration()
  return try await AsrModels.load(from: parakeetDir, configuration: cfg, version: .v3)
}

private func joinTranscript(_ prefix: String, _ suffix: String) -> String {
  if prefix.isEmpty { return suffix }
  if suffix.isEmpty { return prefix }
  return prefix + " " + suffix
}

private func padToMinimumTranscribeLength(
  _ samples: [Float], minimum: Int = 16_000
) -> [Float] {
  if samples.count >= minimum { return samples }
  return samples + Array(repeating: 0, count: minimum - samples.count)
}

/// Spoken-form ASR → written-form (numbers, money, dates, etc.) via NeMo ITN
/// ([FluidInference/text-processing-rs](https://github.com/FluidInference/text-processing-rs)).
/// Used for one-shot `transcribe` and stream **VAD** only — live stream stays raw for stable partials.
private func applyInverseTextNormalization(_ raw: String) -> String {
  let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !trimmed.isEmpty else { return "" }
  return NemoTextProcessing.normalizeSentence(trimmed)
}

/// Builds an AVAudioConverter from `source` format → 16 kHz mono Float32.
private func makeConverter(from source: AVAudioFormat) -> AVAudioConverter? {
  guard
    let target = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: 16_000,
      channels: 1,
      interleaved: false)
  else { return nil }
  return AVAudioConverter(from: source, to: target)
}

private final class AudioFeedState: @unchecked Sendable {
  private let lock = NSLock()
  private var hasFed = false

  func claimInput() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    if hasFed { return false }
    hasFed = true
    return true
  }
}

/// Convert one hardware-format `AVAudioPCMBuffer` to a 16 kHz mono `[Float]`.
private func convert(_ buffer: AVAudioPCMBuffer, using converter: AVAudioConverter) -> [Float] {
  let ratio = 16_000 / buffer.format.sampleRate
  let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio + 32)
  guard
    let out = AVAudioPCMBuffer(
      pcmFormat: converter.outputFormat,
      frameCapacity: capacity)
  else { return [] }

  var err: NSError?
  let feedState = AudioFeedState()
  converter.convert(to: out, error: &err) { _, status in
    if !feedState.claimInput() {
      status.pointee = .noDataNow
      return nil
    }
    status.pointee = .haveData
    return buffer
  }
  guard err == nil, let ch = out.floatChannelData else { return [] }
  let n = Int(out.frameLength)
  var samples = [Float](repeating: 0, count: n)
  for i in 0..<n { samples[i] = ch[0][i] }
  return samples
}

// MARK: - Main

@main
struct CodictateParakeetHelperMain {
  static func main() async {
    do {
      try await run()
    } catch {
      let line = "codictate-parakeet-helper: \(error)\n"
      FileHandle.standardError.write(Data(line.utf8))
      exit(1)
    }
  }

  static func run() async throws {
    var args = CommandLine.arguments
    args.removeFirst()
    guard let cmd = args.first else { usage() }
    args.removeFirst()

    switch cmd {
    case "transcribe": try await transcribeCommand(args)
    case "stream": try await streamCommand(args)
    default: usage()
    }
  }

  // MARK: - transcribe (single WAV → JSON)

  static func transcribeCommand(_ args: [String]) async throws {
    guard args.count >= 2 else { usage() }
    let wavPath = args[0]
    let modelDir = URL(fileURLWithPath: args[1], isDirectory: true)

    logPhase("loading models (first run compiles Core ML — can take a few minutes)…")
    let models = try await loadAsrModels(parakeetDir: modelDir)
    let asr = AsrManager(config: .default)
    try await asr.loadModels(models)

    logPhase("transcribing…")
    let result = try await asr.transcribe(URL(fileURLWithPath: wavPath), source: .system)
    let text = applyInverseTextNormalization(result.text)
    logPhase("done")
    emitJSON(["kind": "final", "text": text])
  }

  // MARK: - stream (mic → inject text locally; no stdout protocol)

  /// Stream modes capture from the mic, transcribe with Parakeet TDT, and inject text
  /// into the focused app via the same clipboard + Cmd+V path as KeyListener.
  /// Stdout is unused; the Bun host only spawns/stops this process.
  ///
  /// **vad** — RMS VAD, one batch transcription per utterance (silence commit), paste + space.
  ///
  /// **live** — Re-transcribe the growing buffer on a cadence (≥1s audio, no partial padding),
  ///            updating the focused field with append-or-LCP-replace. Raw ASR text (no ITN).
  static func streamCommand(_ args: [String]) async throws {
    guard args.count >= 2 else { usage() }
    let mode = args[0]
    let modelDir = URL(fileURLWithPath: args[1], isDirectory: true)

    logPhase("stream [\(mode)]: loading models…")
    let models = try await loadAsrModels(parakeetDir: modelDir)
    logPhase("stream [\(mode)]: models ready")

    if mode == "vad" {
      try await runVadMode(models: models)
    } else {
      try await runLiveMode(models: models)
    }
  }

  // MARK: VAD mode

  static func runVadMode(models: AsrModels) async throws {
    let asr = AsrManager(config: .default)
    try await asr.loadModels(models)

    let engine = AVAudioEngine()
    let inputNode = engine.inputNode
    let hwFormat = inputNode.outputFormat(forBus: 0)

    guard let converter = makeConverter(from: hwFormat) else {
      throw NSError(
        domain: "CodictateParakeet", code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Cannot create audio converter"])
    }

    // Pipe converted 16 kHz chunks into an AsyncStream for sequential VAD processing.
    let (audioStream, audioContinuation) = AsyncStream<[Float]>.makeStream()

    inputNode.installTap(onBus: 0, bufferSize: 4096, format: hwFormat) { buffer, _ in
      let samples = convert(buffer, using: converter)
      if !samples.isEmpty { audioContinuation.yield(samples) }
    }

    try engine.start()
    logPhase("stream [vad]: audio engine running")

    // VAD parameters (16 kHz sample counts)
    let rmsThreshold: Float = 0.012   // energy gate
    let silenceCommit = 8_000         // 500 ms silence → commit utterance
    let minUtterance = 8_000          // 500 ms minimum to bother transcribing
    let maxUtterance = 16_000 * 30    // hard cap at 30 s

    var utterance: [Float] = []
    var inSpeech = false
    var silenceAccum = 0

    for await chunk in audioStream {
      let rms = sqrt(chunk.map { $0 * $0 }.reduce(0, +) / Float(chunk.count))

      if rms >= rmsThreshold {
        silenceAccum = 0
        if !inSpeech {
          inSpeech = true
          utterance = []
          logPhase("stream [vad]: speech start")
        }
        utterance.append(contentsOf: chunk)

        // Hard cap — force a transcription and keep going
        if utterance.count >= maxUtterance {
          await transcribeVadAndInject(asr: asr, samples: utterance)
          utterance = []
        }
      } else if inSpeech {
        utterance.append(contentsOf: chunk)
        silenceAccum += chunk.count

        if silenceAccum >= silenceCommit {
          inSpeech = false
          silenceAccum = 0
          logPhase("stream [vad]: speech end — transcribing \(utterance.count) samples")
          if utterance.count >= minUtterance {
            await transcribeVadAndInject(asr: asr, samples: utterance)
          }
          utterance = []
        }
      }
    }
  }

  private static func transcribeVadAndInject(asr: AsrManager, samples: [Float]) async {
    do {
      let result = try await asr.transcribe(samples, source: .microphone)
      let text = applyInverseTextNormalization(result.text)
      guard !text.isEmpty else { return }
      logPhase("stream [vad]: pasting \(text.count) chars")
      await StreamInjection.pasteOnly(text + " ")
    } catch {
      logPhase("stream [vad]: transcription error: \(error)")
    }
  }

  // MARK: Live mode

  static func runLiveMode(models: AsrModels) async throws {
    let asr = AsrManager(config: .default)
    try await asr.loadModels(models)
    let engine = AVAudioEngine()
    let inputNode = engine.inputNode
    let hwFormat = inputNode.outputFormat(forBus: 0)

    guard let converter = makeConverter(from: hwFormat) else {
      throw NSError(
        domain: "CodictateParakeet", code: 4,
        userInfo: [NSLocalizedDescriptionKey: "Cannot create audio converter"])
    }

    let (audioStream, audioContinuation) = AsyncStream<[Float]>.makeStream()

    inputNode.installTap(onBus: 0, bufferSize: 4096, format: hwFormat) { buffer, _ in
      let samples = convert(buffer, using: converter)
      if !samples.isEmpty { audioContinuation.yield(samples) }
    }

    try engine.start()
    logPhase("stream [live]: audio engine running")

    // FluidAudio rejects < 1s of audio (`invalidAudioData`). Do not zero-pad partial
    // snapshots — padding makes TDT hallucinate long junk, then finals are shorter and
    // the UI deletes huge spans. Partials only run on real ≥1s buffers; short tails
    // are padded only once at utterance end.
    let rmsThreshold: Float = 0.010
    let silenceCommit = 12_000  // ~750ms @ 16kHz — fewer micro segment toggles
    let minUtterance = 2_400
    // FluidAudio requires ≥1s of audio per call; cannot go lower for first partial.
    let minSamplesForInfer = 16_000
    // How much new 16kHz audio between re-transcribe passes (~300ms). Smaller =
    // snappier UI but more ANE work; wall time is still dominated by TDT on long buffers.
    let minSamplesBetweenUpdates = 4_800
    let maxUtterance = 16_000 * 20

    var committedText = ""
    var utterance: [Float] = []
    var inSpeech = false
    var silenceAccum = 0
    var samplesSinceLastUpdate = 0
    var lastLiveText = ""
    var injectedDisplay = ""

    for await chunk in audioStream {
      let rms = sqrt(chunk.map { $0 * $0 }.reduce(0, +) / Float(chunk.count))

      if rms >= rmsThreshold {
        silenceAccum = 0
        if !inSpeech {
          inSpeech = true
          utterance = []
          samplesSinceLastUpdate = 0
          lastLiveText = ""
          logPhase("stream [live]: speech start")
        }

        utterance.append(contentsOf: chunk)
        samplesSinceLastUpdate += chunk.count

        let shouldEmitUpdate =
          utterance.count >= minSamplesForInfer &&
          samplesSinceLastUpdate >= minSamplesBetweenUpdates
        if shouldEmitUpdate {
          samplesSinceLastUpdate = 0
          let partialText = try await asr
            .transcribe(utterance, source: .microphone)
            .text
          guard !partialText.isEmpty, partialText != lastLiveText else { continue }
          lastLiveText = partialText
          let fullText = joinTranscript(committedText, partialText)
          await StreamInjection.updateLiveLine(
            displayed: &injectedDisplay,
            newFull: fullText
          )
        }

        if utterance.count >= maxUtterance {
          let finalInput =
            utterance.count >= minSamplesForInfer
            ? utterance
            : padToMinimumTranscribeLength(utterance)
          let finalText = try await asr
            .transcribe(finalInput, source: .microphone)
            .text
          if !finalText.isEmpty {
            committedText = joinTranscript(committedText, finalText)
            lastLiveText = ""
            await StreamInjection.updateLiveLine(
              displayed: &injectedDisplay,
              newFull: committedText
            )
          }
          utterance = []
          samplesSinceLastUpdate = 0
        }
      } else if inSpeech {
        utterance.append(contentsOf: chunk)
        silenceAccum += chunk.count

        if silenceAccum >= silenceCommit {
          inSpeech = false
          silenceAccum = 0
          logPhase("stream [live]: speech end — finalising utterance")
          if utterance.count >= minUtterance {
            let finalInput =
              utterance.count >= minSamplesForInfer
              ? utterance
              : padToMinimumTranscribeLength(utterance)
            let finalText = try await asr
              .transcribe(finalInput, source: .microphone)
              .text
            if !finalText.isEmpty {
              committedText = joinTranscript(committedText, finalText)
              await StreamInjection.updateLiveLine(
                displayed: &injectedDisplay,
                newFull: committedText
              )
            }
          }
          utterance = []
          samplesSinceLastUpdate = 0
          lastLiveText = ""
        }
      }
    }
  }
}
