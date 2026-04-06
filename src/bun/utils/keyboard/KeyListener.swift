import ApplicationServices
import AVFoundation
import Cocoa
import Foundation

// Read config from stdin (first line) before the command thread consumes stdin.
var swallowRules: [[String: Any]] = []
/// When false, skip CGRequestListenEventAccess on launch (Bun respawns this helper to
/// refresh TCC after the user grants Input Monitoring — a second prompt must not fire).
var requestListenAccessOnLaunch = true
if let line = readLine(),
    let data = line.data(using: .utf8),
    let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
{
    if let rules = parsed["swallow"] as? [[String: Any]] {
        swallowRules = rules
    }
    if let v = parsed["requestListenAccessOnLaunch"] as? Bool {
        requestListenAccessOnLaunch = v
    }
}

func shouldSwallow(
    keycode: Int64, option: Bool, command: Bool, control: Bool, shift: Bool, fn: Bool
) -> Bool {
    for rule in swallowRules {
        if let ruleKeycode = rule["keycode"] as? Int,
            Int64(ruleKeycode) == keycode,
            (rule["option"] as? Bool ?? false) == option,
            (rule["command"] as? Bool ?? false) == command,
            (rule["control"] as? Bool ?? false) == control,
            (rule["shift"] as? Bool ?? false) == shift,
            (rule["fn"] as? Bool ?? false) == fn
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

let mainQueue = DispatchQueue.main

// Stored after tap creation so the callback can re-enable it if macOS disables it.
var globalTap: CFMachPort? = nil
var tapRunLoopSource: CFRunLoopSource? = nil

let eventMask = CGEventMask(1 << CGEventType.keyDown.rawValue)
    | CGEventMask(1 << CGEventType.keyUp.rawValue)
    | CGEventMask(1 << CGEventType.flagsChanged.rawValue)

func micAuthorized() -> Bool {
    AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
}

func emitPermissionsJSON() {
    let im = CGPreflightListenEventAccess()
    let mic = micAuthorized()
    let ax = AXIsProcessTrusted()
    let permMsg =
        "{\"type\": \"permissions\", \"inputMonitoring\": \(im), \"microphone\": \(mic), \"accessibility\": \(ax)}"
    outputQueue.async {
        print(permMsg)
        fflush(stdout)
    }
}

/// Create / enable the CGEvent tap when Input Monitoring preflight passes. Main-thread only.
func ensureTapIfListenAccessGranted() -> Bool {
    assert(Thread.isMainThread)
    guard CGPreflightListenEventAccess() else { return false }

    if let existing = globalTap {
        CGEvent.tapEnable(tap: existing, enable: true)
        return true
    }

    guard
        let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: eventMask,
            callback: callback,
            userInfo: nil
        )
    else {
        outputQueue.async {
            print(
                "{\"type\": \"tap_create_failed\", \"message\": \"Failed to create event tap. Grant Input Monitoring in System Settings > Privacy & Security > Input Monitoring.\"}"
            )
            fflush(stdout)
        }
        return false
    }

    globalTap = tap
    let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
    tapRunLoopSource = runLoopSource
    CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
    CGEvent.tapEnable(tap: tap, enable: true)
    outputQueue.async {
        print("{\"type\": \"tap_attached\"}")
        fflush(stdout)
    }
    return true
}

func disableAndExit() {
    if let t = globalTap { CGEvent.tapEnable(tap: t, enable: false) }
    globalTap = nil
    if let src = tapRunLoopSource {
        CFRunLoopRemoveSource(CFRunLoopGetCurrent(), src, .commonModes)
        tapRunLoopSource = nil
    }
    CFRunLoopStop(CFRunLoopGetCurrent())
}

// ── Signal safety ────────────────────────────────────────────────────────────
signal(SIGPIPE, SIG_IGN)

signal(SIGTERM, SIG_IGN)
let sigtermSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigtermSource.setEventHandler { disableAndExit() }
sigtermSource.resume()

/// Emits keyDown/keyUp and flagsChanged (press + release) so the host can keep a shortcut
/// held and detect release; hold-vs-tap timing uses `DICTATION_HOLD_QUALIFY_MS` in TypeScript.
func callback(
    _ proxy: CGEventTapProxy, _ type: CGEventType, _ event: CGEvent,
    _ refcon: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let t = globalTap { CGEvent.tapEnable(tap: t, enable: true) }
        return nil
    }

    let flags = event.flags
    let option = flags.contains(.maskAlternate)
    let command = flags.contains(.maskCommand)
    let control = flags.contains(.maskControl)
    let shift = flags.contains(.maskShift)
    let fn = flags.contains(.maskSecondaryFn)

    if type == .keyDown || type == .keyUp {
        let keycode = event.getIntegerValueField(.keyboardEventKeycode)
        let keyDown = type == .keyDown
        let isRepeat: Bool
        if type == .keyDown {
            isRepeat = event.getIntegerValueField(.keyboardEventAutorepeat) != 0
        } else {
            isRepeat = false
        }

        let swallow = shouldSwallow(
            keycode: keycode, option: option, command: command,
            control: control, shift: shift, fn: fn)

        let keyMsg =
            "{\"keycode\": \(keycode), \"option\": \(option), \"command\": \(command), \"control\": \(control), \"shift\": \(shift), \"fn\": \(fn), \"keyDown\": \(keyDown), \"isRepeat\": \(isRepeat)}"
        outputQueue.async { print(keyMsg); fflush(stdout) }

        if swallow { return nil }
        return Unmanaged.passRetained(event)
    }

    if type == .flagsChanged {
        let keycode = event.getIntegerValueField(.keyboardEventKeycode)

        // Modifier keys: emit on both press and release. `keyDown` = that modifier bit is on after this event.
        let modKeyDown: Bool?
        switch keycode {
        case 58, 61: modKeyDown = option
        case 56, 60: modKeyDown = shift
        case 55, 54: modKeyDown = command
        case 59, 62: modKeyDown = control
        case 63, 179: modKeyDown = fn
        default:
            modKeyDown = nil
        }

        guard let kd = modKeyDown else {
            return Unmanaged.passRetained(event)
        }

        let swallow = shouldSwallow(
            keycode: keycode, option: option, command: command,
            control: control, shift: shift, fn: fn)

        let keyMsg =
            "{\"keycode\": \(keycode), \"option\": \(option), \"command\": \(command), \"control\": \(control), \"shift\": \(shift), \"fn\": \(fn), \"keyDown\": \(kd), \"isRepeat\": false}"
        outputQueue.async { print(keyMsg); fflush(stdout) }

        if swallow { return nil }
    }

    return Unmanaged.passRetained(event)
}

// Background thread: reads stdin commands from the Bun process.
let commandThread = Thread {
    while let line = readLine() {
        guard
            let data = line.data(using: .utf8),
            let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let command = msg["command"] as? String
        else { continue }

        switch command {
        case "set_clipboard":
            guard let text = msg["text"] as? String else { break }
            NSPasteboard.general.clearContents()
            _ = NSPasteboard.general.setString(text, forType: .string)
            outputQueue.async { print("{\"type\": \"clipboard_set\"}"); fflush(stdout) }

        case "paste_text":
            guard let text = msg["text"] as? String else { break }
            NSPasteboard.general.clearContents()
            _ = NSPasteboard.general.setString(text, forType: .string)
            Thread.sleep(forTimeInterval: 0.05)
            let axOk = AXIsProcessTrusted()
            pasteViaKeyEvent()
            let pasteResult = "{\"type\": \"paste_result\", \"success\": \(axOk), \"accessibility\": \(axOk)}"
            outputQueue.async { print(pasteResult); fflush(stdout) }

        case "check_permissions":
            mainQueue.async {
                _ = ensureTapIfListenAccessGranted()
                emitPermissionsJSON()
            }

        case "request_input_monitoring":
            mainQueue.async {
                CGRequestListenEventAccess()
                _ = ensureTapIfListenAccessGranted()
                emitPermissionsJSON()
            }

        case "prompt_accessibility":
            mainQueue.async {
                let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
                let opts: [String: Any] = [promptKey: true]
                _ = AXIsProcessTrustedWithOptions(opts as CFDictionary)
                emitPermissionsJSON()
            }

        case "request_microphone":
            if micAuthorized() {
                mainQueue.async { emitPermissionsJSON() }
            } else {
                AVCaptureDevice.requestAccess(for: .audio) { _ in
                    mainQueue.async { emitPermissionsJSON() }
                }
            }

        case "quit":
            mainQueue.async { disableAndExit() }

        default:
            break
        }
    }

    mainQueue.async { disableAndExit() }
}
commandThread.start()

let imStart = CGPreflightListenEventAccess()
let micStart = micAuthorized()
let axStart = AXIsProcessTrusted()
print(
    "{\"status\": \"started\", \"inputMonitoring\": \(imStart), \"microphone\": \(micStart), \"accessibility\": \(axStart)}"
)
fflush(stdout)

// First launch: show the Input Monitoring system prompt. Respawned helpers use
// requestListenAccessOnLaunch=false so we only refresh TCC / attach the tap.
if requestListenAccessOnLaunch && !imStart {
    CGRequestListenEventAccess()
}

_ = ensureTapIfListenAccessGranted()
emitPermissionsJSON()

CFRunLoopRun()

exit(0)
