import AppKit
import Foundation
import QuartzCore

enum IndicatorStatus: String, Codable {
  case ready
  case recording
  case transcribing
}

struct IndicatorCommand: Codable {
  let command: String
  let x: Double?
  let y: Double?
  let width: Double?
  let height: Double?
  let status: IndicatorStatus?
}

struct IndicatorEvent: Codable {
  let type: String
  let x: Double?
  let y: Double?
}

@MainActor
final class IndicatorContentView: NSView {
  private let readyBases: [CGFloat] = [0.45, 0.75, 1, 0.7, 0.5]
  private let readyIdleOpacity: [CGFloat] = [0.55, 0.62, 0.78, 0.62, 0.55]
  private let readyRecOpacity: [CGFloat] = [0.68, 0.76, 0.92, 0.76, 0.68]
  private let maxOrbSize: CGFloat = 56

  var status: IndicatorStatus = .ready {
    didSet {
      targetScale = status == .ready ? (38 / maxOrbSize) : 1
      needsDisplay = true
    }
  }

  private var animationTime: TimeInterval = 0
  private var currentScale: CGFloat = 38 / 56
  private var targetScale: CGFloat = 38 / 56

  override var isOpaque: Bool { false }

  func tick(delta: TimeInterval) {
    animationTime += delta
    let speed = min(1, CGFloat(delta * 14))
    currentScale += (targetScale - currentScale) * speed
    if abs(currentScale - targetScale) > 0.0005 || status != .ready {
      needsDisplay = true
    }
  }

  override func draw(_ dirtyRect: NSRect) {
    dirtyRect.fill(using: .clear)

    let isRecording = status == .recording
    let isTranscribing = status == .transcribing
    let displaySize = maxOrbSize * currentScale
    let orbRect = NSRect(
      x: (bounds.width - displaySize) / 2,
      y: (bounds.height - displaySize) / 2,
      width: displaySize,
      height: displaySize
    )

    NSGraphicsContext.saveGraphicsState()
    let shadow = NSShadow()
    shadow.shadowBlurRadius = 5
    shadow.shadowOffset = NSSize(width: 0, height: -1)
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.24)
    shadow.set()
    NSColor.black.setFill()
    NSBezierPath(ovalIn: orbRect).fill()
    NSGraphicsContext.restoreGraphicsState()

    let borderColor: NSColor
    let fillColor: NSColor
    if isRecording {
      borderColor = NSColor.white.withAlphaComponent(0.10)
      fillColor = NSColor.white.withAlphaComponent(0.04)
    } else if isTranscribing {
      borderColor = NSColor.systemOrange.withAlphaComponent(0.20)
      fillColor = NSColor.systemOrange.withAlphaComponent(0.05)
    } else {
      borderColor = NSColor.white.withAlphaComponent(0.08)
      fillColor = NSColor.white.withAlphaComponent(0.03)
    }

    fillColor.setFill()
    NSBezierPath(ovalIn: orbRect).fill()
    borderColor.setStroke()
    let borderPath = NSBezierPath(ovalIn: orbRect.insetBy(dx: 0.5, dy: 0.5))
    borderPath.lineWidth = 1
    borderPath.stroke()

    if isTranscribing {
      drawTranscribingBars(in: orbRect)
    } else {
      drawReadyBars(in: orbRect, active: isRecording)
    }
  }

  private func drawReadyBars(in orbRect: NSRect, active: Bool) {
    let scale = orbRect.width / maxOrbSize
    let rowHeight = 16 as CGFloat * scale
    let barWidth = 3 as CGFloat * scale
    let gap = 2 as CGFloat * scale
    let totalWidth = barWidth * 5 + gap * 4
    let originX = orbRect.midX - totalWidth / 2
    let originY = orbRect.midY - rowHeight / 2

    for index in 0..<readyBases.count {
      let base = readyBases[index]
      let scaleY: CGFloat
      if active {
        let duration = 0.58 + Double(index) * 0.06
        let progress = ((animationTime + Double(index) * 0.09) / duration)
          .truncatingRemainder(dividingBy: 1)
        scaleY = interpolate(progress: progress, values: [base, base * 0.35 + 0.12, base + 0.18, base])
      } else {
        scaleY = base
      }

      let rect = NSRect(
        x: originX + CGFloat(index) * (barWidth + gap),
        y: originY,
        width: barWidth,
        height: rowHeight * scaleY
      )
      let alpha = active ? readyRecOpacity[index] : readyIdleOpacity[index]
      let color = active
        ? NSColor.systemRed.withAlphaComponent(alpha)
        : NSColor.white.withAlphaComponent(alpha)
      color.setFill()
      NSBezierPath(
        roundedRect: rect,
        xRadius: barWidth / 2,
        yRadius: barWidth / 2
      ).fill()
    }
  }

  private func drawTranscribingBars(in orbRect: NSRect) {
    let scale = orbRect.width / maxOrbSize
    let rowHeight = 16 as CGFloat * scale
    let barWidth = 3 as CGFloat * scale
    let gap = 2 as CGFloat * scale
    let totalWidth = barWidth * 3 + gap * 2
    let originX = orbRect.midX - totalWidth / 2
    let originY = orbRect.midY - rowHeight / 2

    for index in 0..<3 {
      let duration = 0.85
      let progress = ((animationTime + Double(index) * 0.14) / duration)
        .truncatingRemainder(dividingBy: 1)
      let scaleY = interpolate(progress: progress, values: [0.28, 1, 0.28])
      let rect = NSRect(
        x: originX + CGFloat(index) * (barWidth + gap),
        y: originY,
        width: barWidth,
        height: rowHeight * scaleY
      )
      NSColor.systemOrange.withAlphaComponent(0.60).setFill()
      NSBezierPath(
        roundedRect: rect,
        xRadius: barWidth / 2,
        yRadius: barWidth / 2
      ).fill()
    }
  }

  private func interpolate(progress: Double, values: [CGFloat]) -> CGFloat {
    guard values.count >= 2 else { return values.first ?? 1 }
    let segmentCount = values.count - 1
    let scaled = min(max(progress, 0), 0.999_999) * Double(segmentCount)
    let index = Int(floor(scaled))
    let local = CGFloat(scaled - Double(index))
    let start = values[index]
    let end = values[index + 1]
    return start + (end - start) * local
  }
}

@MainActor
final class IndicatorPanel: NSPanel {
  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }
}

@MainActor
final class IndicatorWindowDelegate: NSObject, NSWindowDelegate {
  func windowDidMove(_ notification: Notification) {
    guard
      let window = notification.object as? NSWindow,
      let screen = window.screen ?? NSScreen.main
    else { return }

    let frame = window.frame
    let topLeftY = screen.frame.maxY - frame.origin.y - frame.size.height
    let event = IndicatorEvent(type: "move", x: frame.origin.x, y: topLeftY)
    if let data = try? JSONEncoder().encode(event),
       let line = String(data: data, encoding: .utf8) {
      FileHandle.standardOutput.write(Data((line + "\n").utf8))
      fflush(stdout)
    }
  }
}

@MainActor
final class IndicatorController {
  private var panel: IndicatorPanel?
  private var contentView: IndicatorContentView?
  private let delegate = IndicatorWindowDelegate()
  private var animationTimer: Timer?
  private var lastTick = CACurrentMediaTime()

  private func screenForTopLeftRect(_ rect: NSRect) -> NSScreen? {
    NSScreen.screens.first { $0.frame.intersects(rect) } ?? NSScreen.main
  }

  private func appKitFrame(fromTopLeftRect rect: NSRect) -> NSRect {
    guard let screen = screenForTopLeftRect(rect) else { return rect }
    let y = screen.frame.maxY - rect.origin.y - rect.size.height
    return NSRect(
      x: rect.origin.x,
      y: y,
      width: rect.size.width,
      height: rect.size.height
    )
  }

  private func startAnimationTimer() {
    guard animationTimer == nil else { return }
    lastTick = CACurrentMediaTime()
    animationTimer = Timer.scheduledTimer(
      timeInterval: 1 / 30,
      target: self,
      selector: #selector(handleAnimationTimer),
      userInfo: nil,
      repeats: true
    )
    if let animationTimer {
      RunLoop.main.add(animationTimer, forMode: .common)
    }
  }

  @objc private func handleAnimationTimer() {
    guard let contentView else { return }
    let now = CACurrentMediaTime()
    let delta = now - lastTick
    lastTick = now
    contentView.tick(delta: delta)
  }

  private func stopAnimationTimer() {
    animationTimer?.invalidate()
    animationTimer = nil
  }

  func show(frame: NSRect, status: IndicatorStatus) {
    let appKitFrame = appKitFrame(fromTopLeftRect: frame)
    if panel == nil {
      let nextPanel = IndicatorPanel(
        contentRect: appKitFrame,
        styleMask: [.borderless, .nonactivatingPanel],
        backing: .buffered,
        defer: false
      )
      let nextContentView = IndicatorContentView(
        frame: NSRect(origin: .zero, size: frame.size)
      )
      nextPanel.isOpaque = false
      nextPanel.backgroundColor = .clear
      nextPanel.hasShadow = false
      nextPanel.hidesOnDeactivate = false
      nextPanel.isMovableByWindowBackground = true
      nextPanel.level = .screenSaver
      nextPanel.collectionBehavior = [
        .canJoinAllSpaces,
        .fullScreenAuxiliary,
        .stationary,
        .ignoresCycle,
      ]
      nextPanel.contentView = nextContentView
      nextPanel.delegate = delegate
      panel = nextPanel
      contentView = nextContentView
    }

    panel?.setFrame(appKitFrame, display: true)
    contentView?.frame = NSRect(origin: .zero, size: frame.size)
    contentView?.status = status
    panel?.orderFrontRegardless()
    startAnimationTimer()
  }

  func hide() {
    panel?.orderOut(nil)
  }

  func setStatus(_ status: IndicatorStatus) {
    contentView?.status = status
    panel?.orderFrontRegardless()
    startAnimationTimer()
  }

  func destroyAndQuit() {
    stopAnimationTimer()
    panel?.close()
    panel = nil
    contentView = nil
    NSApp.terminate(nil)
  }
}

let controller = IndicatorController()

DispatchQueue.global(qos: .userInitiated).async {
  while let line = readLine() {
    guard let data = line.data(using: .utf8) else { continue }
    guard
      let cmd = try? JSONDecoder().decode(IndicatorCommand.self, from: data)
    else { continue }

    Task { @MainActor in
      switch cmd.command {
      case "show":
        guard
          let x = cmd.x,
          let y = cmd.y,
          let width = cmd.width,
          let height = cmd.height
        else { return }
        controller.show(
          frame: NSRect(x: x, y: y, width: width, height: height),
          status: cmd.status ?? .ready
        )
      case "hide":
        controller.hide()
      case "status":
        if let status = cmd.status {
          controller.setStatus(status)
        }
      case "quit":
        controller.destroyAndQuit()
      default:
        break
      }
    }
  }

  Task { @MainActor in
    controller.destroyAndQuit()
  }
}

NSApplication.shared.setActivationPolicy(.accessory)
NSApplication.shared.run()
