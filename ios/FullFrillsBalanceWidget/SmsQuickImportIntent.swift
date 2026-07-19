import AppIntents
import WidgetKit

private let appGroupId = WidgetConstants.appGroupId
private let appScheme = "fullfrillsbalance"

/// Native AppIntent for 1-tap SMS quick-import from the widget.
///
/// ARCHITECTURE & FOREGROUND REQUIREMENT:
/// WatermelonDB database persistence, double-entry ledger rules, and transaction creation
/// logic exist exclusively in the React Native / JavaScript layer. iOS WidgetKit AppIntents
/// run in a lightweight extension process without access to the React Native JS runtime or
/// SQLite database connection.
///
/// Therefore, when a user taps quick-import on the widget:
/// 1. The intent writes the record ID flag (`pending_sms_quick_approve`) to AppGroup UserDefaults.
/// 2. The intent opens the deep link (`fullfrillsbalance://inbox?approve=<recordId>`).
/// 3. The main application foregrounds, wakes JS runtime, and calls
///    `smsService.processInboxRecord(recordId, 'imported')` to execute the transaction creation.
struct SmsQuickImportIntent: AppIntent {
  static let title: LocalizedStringResource = "Quick Import SMS"
  static let description: IntentDescription? = IntentDescription(
    "Quickly approve and import a pending SMS transaction from the widget.",
    categoryName: "Finance"
  )

  @Parameter(title: "Record ID")
  var recordId: String

  init() {}

  init(recordId: String) {
    self.recordId = recordId
  }

  func perform() async throws -> some IntentResult {
    guard let defaults = UserDefaults(suiteName: appGroupId) else {
      return .result()
    }

    // Read the pending SMS details so the intent is self-documenting
    // (they remain stored under pending_sms_{recordId}_* for the app to consume)

    // Store a flag so the app knows which record to auto-approve on open
    defaults.set(recordId, forKey: PendingSmsKeys.quickApprove)

    // Open the app URL — the app handles fullfrillsbalance://inbox?approve=<recordId>
    // in its URL handler and processes the import from the stored pending SMS data.
    if let url = URL(string: "\(appScheme)://inbox?approve=\(recordId)") {
      let openResult = await UIApplication.shared.open(url)
      if !openResult {
        // If the app couldn't be opened, clear the approval flag
        defaults.removeObject(forKey: PendingSmsKeys.quickApprove)
      }
    }

    // Refresh all widget timelines so the triage widget reflects the change
    WidgetCenter.shared.reloadAllTimelines()

    return .result()
  }
}
