import Cocoa
import Foundation
import AVFoundation

// Input Monitoring is the correct permission for CGEvent.tapCreate on modern macOS.
let hasPermission = CGPreflightListenEventAccess()

// Request microphone proactively so the user sees the dialog at startup instead
// of being surprised during the first recording.
var micAuthorized = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
if !micAuthorized {
    let sem = DispatchSemaphore(value: 0)
    AVCaptureDevice.requestAccess(for: .audio) { granted in
        micAuthorized = granted
        sem.signal()
    }
    sem.wait()
}

let hasAccessibility = AXIsProcessTrusted()

print("{\"status\": \"started\", \"inputMonitoring\": \(hasPermission), \"microphone\": \(micAuthorized), \"accessibility\": \(hasAccessibility)}")
fflush(stdout)

if !hasPermission {
    CGRequestListenEventAccess()
    print("{\"status\": \"permission_requested\", \"message\": \"Grant Input Monitoring in System Settings > Privacy & Security > Input Monitoring, then restart the app.\"}")
    fflush(stdout)
    exit(1)
}

// Read swallow rules from stdin (first line)
var swallowRules: [[String: Any]] = []
if let line = readLine(),
    let data = line.data(using: .utf8),
    let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
    let rules = parsed["swallow"] as? [[String: Any]]
{
    swallowRules = rules
}

func shouldSwallow(keycode: Int64, option: Bool, command: Bool, control: Bool, shift: Bool) -> Bool {
    for rule in swallowRules {
        if let ruleKeycode = rule["keycode"] as? Int,
            Int64(ruleKeycode) == keycode,
            (rule["option"] as? Bool ?? false) == option,
            (rule["command"] as? Bool ?? false) == command,
            (rule["control"] as? Bool ?? false) == control,
            (rule["shift"] as? Bool ?? false) == shift
        {
            return true
        }
    }
    return false
}

func pasteViaKeyEvent() {
    let src = CGEventSource(stateID: .hidSystemState)
    let vKey: CGKeyCode = 0x09 // 'v'
    guard
        let keyDown = CGEvent(keyboardEventSource: src, virtualKey: vKey, keyDown: true),
        let keyUp = CGEvent(keyboardEventSource: src, virtualKey: vKey, keyDown: false)
    else { return }
    keyDown.flags = .maskCommand
    keyUp.flags = .maskCommand
    keyDown.post(tap: .cgSessionEventTap)
    keyUp.post(tap: .cgSessionEventTap)
}

// Serial queue for stdout writes. Must be declared before commandThread because
// the thread body captures it. Keeps the event tap callback from ever blocking
// on pipe I/O — a stalled callback causes macOS to disable the tap.
let outputQueue = DispatchQueue(label: "com.codictate.keylistener.output", qos: .userInteractive)

// Stored after tap creation so the callback can re-enable it if macOS disables it.
var globalTap: CFMachPort? = nil

func disableAndExit() {
    // Disable the event tap so the keyboard is immediately restored, then stop
    // the run loop so the process exits cleanly.
    if let t = globalTap { CGEvent.tapEnable(tap: t, enable: false) }
    DispatchQueue.main.async { CFRunLoopStop(CFRunLoopGetCurrent()) }
}

// ── Signal safety ────────────────────────────────────────────────────────────
//
// Problem: when Bun exits (via _exit), two signals can reach this process
// before the stdin-EOF is detected and disableAndExit() runs:
//
//   SIGPIPE  — outputQueue.async fires a write to the now-broken stdout pipe.
//              The default handler kills the process instantly, leaving the
//              CGEventTap active and freezing ALL keyboard input (incl. Spotlight).
//
//   SIGTERM  — keyboard.stop() in Bun calls proc.kill() which sends SIGTERM.
//              The default handler also kills the process without cleanup.
//
// Fixes:
//   • Ignore SIGPIPE so broken-pipe writes fail silently (EPIPE) rather than
//     terminating the process prematurely.
//   • Install a DispatchSource SIGTERM handler that calls disableAndExit()
//     so the tap is always disabled before the process exits.

signal(SIGPIPE, SIG_IGN)

signal(SIGTERM, SIG_IGN) // block default handler so DispatchSource runs instead
let sigtermSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigtermSource.setEventHandler { disableAndExit() }
sigtermSource.resume()

// Background thread: reads stdin commands from the Bun process.
// CRITICAL: when readLine() returns nil, the parent Bun process has exited
// (stdin pipe closed). Without cleanup, this process becomes a ghost that
// holds an active event tap and freezes ALL keyboard input on the machine.
let commandThread = Thread {
    while let line = readLine() {
        guard
            let data = line.data(using: .utf8),
            let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let command = msg["command"] as? String
        else { continue }

        switch command {
        case "paste":
            // Small delay so the clipboard write is guaranteed to complete first
            Thread.sleep(forTimeInterval: 0.05)
            pasteViaKeyEvent()

        case "check_permissions":
            let micOk = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
            let axOk = AXIsProcessTrusted()
            let permMsg = "{\"type\": \"permissions\", \"inputMonitoring\": true, \"microphone\": \(micOk), \"accessibility\": \(axOk)}"
            outputQueue.async { print(permMsg); fflush(stdout) }

        case "quit":
            disableAndExit()

        default:
            break
        }
    }

    // stdin EOF — Bun parent has exited. Restore keyboard immediately.
    disableAndExit()
}
commandThread.start()

func callback(
    _ proxy: CGEventTapProxy, _ type: CGEventType, _ event: CGEvent,
    _ refcon: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    // macOS disables an active tap whose callback stalls. Re-enable immediately
    // so the keyboard is never permanently broken.
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let t = globalTap { CGEvent.tapEnable(tap: t, enable: true) }
        return nil
    }

    if type == .keyDown {
        let keycode = event.getIntegerValueField(.keyboardEventKeycode)
        let flags = event.flags
        let option = flags.contains(.maskAlternate)
        let command = flags.contains(.maskCommand)
        let control = flags.contains(.maskControl)
        let shift = flags.contains(.maskShift)

        // Decide swallow synchronously (fast array scan, no I/O) so the
        // callback returns in microseconds before dispatching the output.
        let swallow = shouldSwallow(
            keycode: keycode, option: option, command: command,
            control: control, shift: shift)

        let keyMsg = "{\"keycode\": \(keycode), \"option\": \(option), \"command\": \(command), \"control\": \(control), \"shift\": \(shift)}"
        outputQueue.async { print(keyMsg); fflush(stdout) }

        if swallow { return nil }
    }
    return Unmanaged.passRetained(event)
}

let eventMask = CGEventMask(1 << CGEventType.keyDown.rawValue)

guard let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .defaultTap,
    eventsOfInterest: eventMask,
    callback: callback,
    userInfo: nil
) else {
    print("{\"status\": \"error\", \"message\": \"Failed to create event tap. Grant Input Monitoring in System Settings > Privacy & Security > Input Monitoring and restart the app.\"}")
    fflush(stdout)
    exit(1)
}

globalTap = tap

let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
CFRunLoopRun()

// CFRunLoopRun() returned — run loop was stopped by disableAndExit(). Clean exit.
exit(0)
