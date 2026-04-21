import AppKit
import ApplicationServices
import Foundation

// ── stdout helper ──────────────────────────────────────────────────────────

func emit(_ payload: [String: String]) {
  guard let data = try? JSONSerialization.data(withJSONObject: payload),
    let line = String(data: data, encoding: .utf8)
  else { return }
  FileHandle.standardOutput.write(Data((line + "\n").utf8))
  fflush(stdout)
}

// ── Observer state ─────────────────────────────────────────────────────────

final class ObserverState: @unchecked Sendable {
  var elementObserver: AXObserver?
  var systemObserver: AXObserver?
  var observedElement: AXUIElement?
  var snapshotBefore: String = ""
  var active = false
  var timeoutWork: DispatchWorkItem?
}

let state = ObserverState()

// AXObserver callbacks must be C-compatible functions.
// We use a global function and retrieve state via the refcon pointer.

func elementCallback(
  observer: AXObserver,
  element: AXUIElement,
  notification: CFString,
  refcon: UnsafeMutableRawPointer?
) {
  // kAXValueChangedNotification — restart the inactivity timeout
  DispatchQueue.main.async {
    resetTimeout()
  }
}

func systemCallback(
  observer: AXObserver,
  element: AXUIElement,
  notification: CFString,
  refcon: UnsafeMutableRawPointer?
) {
  // Focus moved away — end observation immediately
  DispatchQueue.main.async {
    finishObservation()
  }
}

// ── Core observation logic ─────────────────────────────────────────────────

func resetTimeout() {
  guard state.active else { return }
  state.timeoutWork?.cancel()
  let work = DispatchWorkItem { finishObservation() }
  state.timeoutWork = work
  DispatchQueue.main.asyncAfter(deadline: .now() + 6.0, execute: work)
}

func finishObservation() {
  guard state.active else { return }
  state.active = false
  state.timeoutWork?.cancel()
  state.timeoutWork = nil

  defer { teardownObservers() }

  guard let element = state.observedElement else { return }

  var valRef: CFTypeRef?
  guard
    AXUIElementCopyAttributeValue(
      element, kAXValueAttribute as CFString, &valRef) == .success,
    let snapshotAfter = valRef as? String,
    snapshotAfter != state.snapshotBefore
  else { return }

  emit([
    "type": "correction",
    "originalText": state.snapshotBefore,
    "currentText": snapshotAfter,
  ])
}

func teardownObservers() {
  if let obs = state.elementObserver, let el = state.observedElement {
    AXObserverRemoveNotification(obs, el, kAXValueChangedNotification as CFString)
    CFRunLoopRemoveSource(
      CFRunLoopGetMain(),
      AXObserverGetRunLoopSource(obs),
      .defaultMode)
  }
  if let obs = state.systemObserver {
    let sysWide = AXUIElementCreateSystemWide()
    AXObserverRemoveNotification(
      obs, sysWide, kAXFocusedUIElementChangedNotification as CFString)
    CFRunLoopRemoveSource(
      CFRunLoopGetMain(),
      AXObserverGetRunLoopSource(obs),
      .defaultMode)
  }
  state.elementObserver = nil
  state.systemObserver = nil
  state.observedElement = nil
}

func startObservation() {
  guard AXIsProcessTrusted() else {
    emit(["type": "unsupported"])
    return
  }

  // Cancel any previous observation
  if state.active {
    state.active = false
    state.timeoutWork?.cancel()
    teardownObservers()
  }

  let sysWide = AXUIElementCreateSystemWide()
  var focusedRef: CFTypeRef?
  guard
    AXUIElementCopyAttributeValue(
      sysWide, kAXFocusedUIElementAttribute as CFString, &focusedRef) == .success,
    let focused = focusedRef
  else {
    emit(["type": "unsupported"])
    return
  }

  let element = focused as! AXUIElement

  var valRef: CFTypeRef?
  guard
    AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &valRef) == .success,
    let snapshot = valRef as? String
  else {
    // Element doesn't expose text value — browser/Electron/unsupported app
    emit(["type": "unsupported"])
    return
  }

  state.snapshotBefore = snapshot
  state.observedElement = element
  state.active = true

  // Set up per-element observer
  var elemPid: pid_t = 0
  AXUIElementGetPid(element, &elemPid)

  var elemObs: AXObserver?
  if AXObserverCreate(elemPid, elementCallback, &elemObs) == .success,
    let elemObs
  {
    if AXObserverAddNotification(elemObs, element, kAXValueChangedNotification as CFString, nil)
      == .success
    {
      CFRunLoopAddSource(
        CFRunLoopGetMain(),
        AXObserverGetRunLoopSource(elemObs),
        .defaultMode)
      state.elementObserver = elemObs
    }
  }

  // Set up system-wide focus-change observer (any process)
  // We use pid 0 trick via the frontmost app pid for the system element
  let frontPid = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 1
  var sysObs: AXObserver?
  if AXObserverCreate(frontPid, systemCallback, &sysObs) == .success,
    let sysObs
  {
    if AXObserverAddNotification(
      sysObs, sysWide, kAXFocusedUIElementChangedNotification as CFString, nil)
      == .success
    {
      CFRunLoopAddSource(
        CFRunLoopGetMain(),
        AXObserverGetRunLoopSource(sysObs),
        .defaultMode)
      state.systemObserver = sysObs
    }
  }

  resetTimeout()
}

// ── stdin command loop ─────────────────────────────────────────────────────

struct Command: Codable {
  let command: String
}

DispatchQueue.global(qos: .userInitiated).async {
  while let line = readLine() {
    guard let data = line.data(using: .utf8),
      let cmd = try? JSONDecoder().decode(Command.self, from: data)
    else { continue }

    DispatchQueue.main.async {
      switch cmd.command {
      case "observe":
        startObservation()
      case "cancel":
        if state.active {
          state.active = false
          state.timeoutWork?.cancel()
          teardownObservers()
        }
      case "quit":
        NSApp.terminate(nil)
      default:
        break
      }
    }
  }

  DispatchQueue.main.async {
    NSApp.terminate(nil)
  }
}

emit(["type": "ready"])
NSApplication.shared.setActivationPolicy(.accessory)
NSApplication.shared.run()
