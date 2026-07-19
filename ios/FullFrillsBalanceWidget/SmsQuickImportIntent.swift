import AppIntents
import WidgetKit

private let appGroupId = "group.in.sahilsoni.fullfrillsbalance.widgets"
private let appScheme = "fullfrillsbalance"

/// Native AppIntent for 1-tap SMS quick-import from the widget.
/// Reads pending SMS details from AppGroup UserDefaults and opens the app
/// at the approval URL so the foreground app processes the import.
/// Because this is an AppIntent, it can run without waking the React Native JS runtime.
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
    let merchant = defaults.string(forKey: "pending_sms_\(recordId)_merchant") ?? ""
    let amount = defaults.string(forKey: "pending_sms_\(recordId)_amount") ?? ""
    let currency = defaults.string(forKey: "pending_sms_\(recordId)_currency") ?? ""

    // Store a flag so the app knows which record to auto-approve on open
    defaults.set(recordId, forKey: "pending_sms_quick_approve")

    // Open the app URL — the app handles fullfrillsbalance://inbox?approve=<recordId>
    // in its URL handler and processes the import from the stored pending SMS data.
    if let url = URL(string: "\(appScheme)://inbox?approve=\(recordId)") {
      let openResult = await UIApplication.shared.open(url)
      if !openResult {
        // If the app couldn't be opened, clear the approval flag
        defaults.removeObject(forKey: "pending_sms_quick_approve")
      }
    }

    // Refresh all widget timelines so the triage widget reflects the change
    WidgetCenter.shared.reloadAllTimelines()

    return .result()
  }
}
