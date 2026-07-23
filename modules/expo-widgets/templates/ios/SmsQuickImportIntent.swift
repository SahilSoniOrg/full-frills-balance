import AppIntents
import WidgetKit

private let appGroupId = "group.in.sahilsoni.fullfrillsbalance.widgets" // expo-inject-iosappgroup

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
/// 2. The intent reloads all widget timelines.
/// 3. When the user opens the application, JS runtime reads `pending_sms_quick_approve`
///    and auto-processes the approval.
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
    if let defaults = UserDefaults(suiteName: appGroupId) {
      // Store a flag so the app knows which record to auto-approve on open
      defaults.set(recordId, forKey: PendingSmsKeys.quickApprove)
    }

    // Refresh all widget timelines so the triage widget reflects the change
    WidgetCenter.shared.reloadAllTimelines()

    return .result()
  }
}
