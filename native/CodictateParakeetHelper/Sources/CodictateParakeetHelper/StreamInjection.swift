import AppKit
import ApplicationServices
import Foundation

/// Serializes clipboard + CGEvent injection so stream updates never overlap.
enum StreamInjection {
  private static let queue = DispatchQueue(
    label: "com.codictate.parakeethelper.stream-inject",
    qos: .userInteractive
  )

  private static func pasteViaCmdV() {
    let src = CGEventSource(stateID: .hidSystemState)
    let vKey: CGKeyCode = 0x09
    guard
      let keyDown = CGEvent(keyboardEventSource: src, virtualKey: vKey, keyDown: true),
      let keyUp = CGEvent(keyboardEventSource: src, virtualKey: vKey, keyDown: false)
    else { return }
    keyDown.flags = .maskCommand
    keyUp.flags = .maskCommand
    keyDown.post(tap: .cgSessionEventTap)
    keyUp.post(tap: .cgSessionEventTap)
  }

  private static func deleteBackward(count: Int) {
    guard count > 0 else { return }
    let src = CGEventSource(stateID: .hidSystemState)
    let vKey: CGKeyCode = 0x33
    for _ in 0..<count {
      guard
        let keyDown = CGEvent(keyboardEventSource: src, virtualKey: vKey, keyDown: true),
        let keyUp = CGEvent(keyboardEventSource: src, virtualKey: vKey, keyDown: false)
      else { return }
      keyDown.post(tap: .cgSessionEventTap)
      keyUp.post(tap: .cgSessionEventTap)
    }
  }

  static func pasteOnly(_ text: String) async {
    await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
      queue.async {
        NSPasteboard.general.clearContents()
        _ = NSPasteboard.general.setString(text, forType: .string)
        // Tiny yield so NSPasteboard wins over the subsequent Cmd+V (was 50ms).
        Thread.sleep(forTimeInterval: 0.012)
        pasteViaCmdV()
        cont.resume()
      }
    }
  }

  /// Match KeyListener `replace_text`: clipboard = insert, delete N graphemes, Cmd+V.
  static func replace(deleteText: String, insertText: String) async {
    await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
      queue.async {
        NSPasteboard.general.clearContents()
        _ = NSPasteboard.general.setString(insertText, forType: .string)
        Thread.sleep(forTimeInterval: 0.008)
        deleteBackward(count: deleteText.count)
        Thread.sleep(forTimeInterval: 0.008)
        pasteViaCmdV()
        cont.resume()
      }
    }
  }

  private static func graphemeCountPrefix(_ a: String, _ b: String) -> Int {
    let ac = Array(a)
    let bc = Array(b)
    let n = min(ac.count, bc.count)
    var i = 0
    while i < n, ac[i] == bc[i] { i += 1 }
    return i
  }

  private static func suffixGraphemes(_ s: String, afterPrefixLength p: Int) -> String {
    String(Array(s).dropFirst(p))
  }

  /// Keeps the focused field aligned with the latest full-line hypothesis (model output only).
  static func updateLiveLine(displayed: inout String, newFull: String) async {
    guard !newFull.isEmpty else { return }
    if newFull == displayed { return }

    if newFull.hasPrefix(displayed) {
      let suffix = String(newFull.dropFirst(displayed.count))
      guard !suffix.isEmpty else { return }
      await pasteOnly(suffix)
      displayed = newFull
      return
    }

    let p = graphemeCountPrefix(displayed, newFull)
    let deletePart = suffixGraphemes(displayed, afterPrefixLength: p)
    let insertPart = suffixGraphemes(newFull, afterPrefixLength: p)
    await replace(deleteText: deletePart, insertText: insertPart)
    displayed = newFull
  }
}
