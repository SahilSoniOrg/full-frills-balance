import ExpoModulesCore
import WidgetKit

public final class ExpoWidgetsModule: Module {
  private let appGroupId = "group.in.sahilsoni.fullfrillsbalance.widgets"

  public func definition() -> ModuleDefinition {
    Name("ExpoWidgets")

    AsyncFunction("syncWidgetData") { (snapshot: [String: Any]) in
      guard let defaults = UserDefaults(suiteName: self.appGroupId) else {
        return
      }

      if let safeToSpend = snapshot["safeToSpend"] as? [String: Any] {
        defaults.set((safeToSpend["amount"] as? NSNumber)?.doubleValue ?? 0, forKey: "safe_to_spend_amount")
        defaults.set(safeToSpend["currencyCode"] as? String ?? "", forKey: "safe_to_spend_currency")
        defaults.set(safeToSpend["formattedAmount"] as? String ?? "", forKey: "safe_to_spend_formatted_amount")
        defaults.set(safeToSpend["title"] as? String ?? "", forKey: "safe_to_spend_title")
        defaults.set(safeToSpend["subtitle"] as? String ?? "", forKey: "safe_to_spend_subtitle")
        defaults.set((safeToSpend["updatedAt"] as? NSNumber)?.doubleValue ?? Date().timeIntervalSince1970 * 1000, forKey: "safe_to_spend_updated_at")
      } else {
        defaults.removeObject(forKey: "safe_to_spend_amount")
        defaults.removeObject(forKey: "safe_to_spend_currency")
        defaults.removeObject(forKey: "safe_to_spend_formatted_amount")
        defaults.removeObject(forKey: "safe_to_spend_title")
        defaults.removeObject(forKey: "safe_to_spend_subtitle")
        defaults.removeObject(forKey: "safe_to_spend_updated_at")
      }

      if let theme = snapshot["theme"] as? [String: Any] {
        defaults.set(theme["themeId"] as? String ?? "", forKey: "widget_theme_id")
        defaults.set(theme["themeMode"] as? String ?? "", forKey: "widget_theme_mode")
        defaults.set(theme["backgroundStartColor"] as? String ?? "", forKey: "widget_theme_background_start")
        defaults.set(theme["backgroundEndColor"] as? String ?? "", forKey: "widget_theme_background_end")
        defaults.set(theme["titleColor"] as? String ?? "", forKey: "widget_theme_title_color")
        defaults.set(theme["primaryTextColor"] as? String ?? "", forKey: "widget_theme_primary_text_color")
        defaults.set(theme["secondaryTextColor"] as? String ?? "", forKey: "widget_theme_secondary_text_color")
        defaults.set(theme["actionIconColor"] as? String ?? "", forKey: "widget_theme_action_icon_color")
        defaults.set(theme["incomeAccentColor"] as? String ?? "", forKey: "widget_theme_income_accent_color")
        defaults.set(theme["expenseAccentColor"] as? String ?? "", forKey: "widget_theme_expense_accent_color")
        defaults.set(theme["transferAccentColor"] as? String ?? "", forKey: "widget_theme_transfer_accent_color")
      } else {
        defaults.removeObject(forKey: "widget_theme_id")
        defaults.removeObject(forKey: "widget_theme_mode")
        defaults.removeObject(forKey: "widget_theme_background_start")
        defaults.removeObject(forKey: "widget_theme_background_end")
        defaults.removeObject(forKey: "widget_theme_title_color")
        defaults.removeObject(forKey: "widget_theme_primary_text_color")
        defaults.removeObject(forKey: "widget_theme_secondary_text_color")
        defaults.removeObject(forKey: "widget_theme_action_icon_color")
        defaults.removeObject(forKey: "widget_theme_income_accent_color")
        defaults.removeObject(forKey: "widget_theme_expense_accent_color")
        defaults.removeObject(forKey: "widget_theme_transfer_accent_color")
      }

      if let isPrivacyEnabled = snapshot["isPrivacyEnabled"] as? Bool {
        defaults.set(isPrivacyEnabled, forKey: "widget_is_privacy_enabled")
      } else {
        defaults.set(false, forKey: "widget_is_privacy_enabled")
      }

      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    AsyncFunction("refreshWidgets") {
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    /// Store pending SMS records for the SMS Triage widget.
    /// Called from JS after the SMS pipeline produces pending items that need
    /// user approval. Serialises each record into AppGroup UserDefaults using
    /// the key pattern `pending_sms_<id>_<field>` so the widget extension can
    /// read them without accessing the database or waking JS.
    AsyncFunction("storePendingSms") { (records: [[String: Any]]) in
      guard let defaults = UserDefaults(suiteName: self.appGroupId) else {
        return
      }

      // Collect all existing record IDs (for cleanup of stale entries)
      let existingRecordsData = defaults.data(forKey: "pending_sms_records")
      let decoder = JSONDecoder()
      var previousIds = Set<String>()
      if let existingData = existingRecordsData,
         let ids = try? decoder.decode([String].self, from: existingData) {
        previousIds = Set(ids)
      }

      var currentIds: [String] = []
      var cleanIds = Set<String>()

      for record in records {
        guard let id = record["id"] as? String else { continue }
        currentIds.append(id)
        cleanIds.insert(id)

        defaults.set(record["merchant"] as? String ?? "", forKey: "pending_sms_\(id)_merchant")
        defaults.set(record["amount"] as? String ?? "", forKey: "pending_sms_\(id)_amount")
        defaults.set(record["currency"] as? String ?? "", forKey: "pending_sms_\(id)_currency")
        defaults.set(record["sender"] as? String ?? "", forKey: "pending_sms_\(id)_sender")
        defaults.set(record["date"] as? Double ?? Date().timeIntervalSince1970 * 1000, forKey: "pending_sms_\(id)_date")
      }

      // Store the ordered list of record IDs
      let encoder = JSONEncoder()
      if let encoded = try? encoder.encode(currentIds) {
        defaults.set(encoded, forKey: "pending_sms_records")
      }

      // Clean up stale entries that are no longer in the new records
      let staleIds = previousIds.subtracting(cleanIds)
      for staleId in staleIds {
        defaults.removeObject(forKey: "pending_sms_\(staleId)_merchant")
        defaults.removeObject(forKey: "pending_sms_\(staleId)_amount")
        defaults.removeObject(forKey: "pending_sms_\(staleId)_currency")
        defaults.removeObject(forKey: "pending_sms_\(staleId)_sender")
        defaults.removeObject(forKey: "pending_sms_\(staleId)_date")
      }

      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }
  }
}
