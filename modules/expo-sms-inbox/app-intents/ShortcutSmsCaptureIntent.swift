import AppIntents
internal import ExpoSmsInbox
import Foundation

struct CaptureBankAlertIntent: AppIntent {
  static var title: LocalizedStringResource = "Capture bank alert"
  static var description = IntentDescription("Save a bank text for private, on-device transaction review.")
  static var openAppWhenRun = false

  @Parameter(title: "Message")
  var message: String

  @Parameter(title: "Sender")
  var sender: String?

  @Parameter(title: "Received at")
  var receivedAt: Date?

  func perform() async throws -> some IntentResult {
    _ = try ShortcutSmsQueue.enqueue(body: message, sender: sender, receivedAt: receivedAt)
    return .result()
  }
}
