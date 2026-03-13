import Cocoa
import Foundation

// Input Monitoring is the correct permission for CGEvent.tapCreate on modern macOS.
// AXIsProcessTrusted() (Accessibility) is a separate permission that is NOT sufficient.
let hasPermission = CGPreflightListenEventAccess()

print("{\"status\": \"started\", \"inputMonitoring\": \(hasPermission)}")
fflush(stdout)

if !hasPermission {
    // Trigger the system prompt — user must grant Input Monitoring in:
    // System Settings > Privacy & Security > Input Monitoring
    CGRequestListenEventAccess()
    print("{\"status\": \"permission_requested\", \"message\": \"Grant Input Monitoring in System Settings > Privacy & Security > Input Monitoring, then restart the app.\"}")
    fflush(stdout)
    exit(1)
}

// Read swallow rules from stdin (first line)
var swallowRules: [[String: Any]] = []

if let line = readLine(),
    let data = line.data(using: .utf8),
    let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
    let rules = json["swallow"] as? [[String: Any]]
{
    swallowRules = rules
}

func shouldSwallow(keycode: Int64, option: Bool, command: Bool, control: Bool, shift: Bool) -> Bool
{
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

// Background thread: reads subsequent stdin lines for commands from the Bun process.
// This avoids needing System Events / Automation permission for paste.
let commandThread = Thread {
    while let line = readLine() {
        guard
            let data = line.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let command = json["command"] as? String
        else { continue }

        if command == "paste" {
            // Small delay so the clipboard write is guaranteed to complete first
            Thread.sleep(forTimeInterval: 0.05)
            pasteViaKeyEvent()
        }
    }
}
commandThread.start()

func callback(
    _ proxy: CGEventTapProxy, _ type: CGEventType, _ event: CGEvent,
    _ refcon: UnsafeMutableRawPointer?
) -> Unmanaged<CGEvent>? {
    if type == .keyDown {
        let keycode = event.getIntegerValueField(.keyboardEventKeycode)
        let flags = event.flags
        let option = flags.contains(.maskAlternate)
        let command = flags.contains(.maskCommand)
        let control = flags.contains(.maskControl)
        let shift = flags.contains(.maskShift)

        print(
            "{\"keycode\": \(keycode), \"option\": \(option), \"command\": \(command), \"control\": \(control), \"shift\": \(shift)}"
        )
        fflush(stdout)

        if shouldSwallow(
            keycode: keycode, option: option, command: command, control: control, shift: shift)
        {
            return nil
        }
    }
    return Unmanaged.passRetained(event)
}

let eventMask = (1 << CGEventType.keyDown.rawValue)

guard let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .defaultTap,
    eventsOfInterest: CGEventMask(eventMask),
    callback: callback,
    userInfo: nil
) else {
    print("{\"status\": \"error\", \"message\": \"Failed to create event tap. Grant Input Monitoring in System Settings > Privacy & Security > Input Monitoring and restart the app.\"}")
    fflush(stdout)
    exit(1)
}

let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
CFRunLoopRun()
