import ExpoModulesCore
import WidgetKit
import OSLog

private let logger = Logger(subsystem: "in.sahilsoni.fullfrillsbalance", category: "ExpoWidgets")

struct PendingSmsRecord: Record {
  @Field var id: String = ""
  @Field var merchant: String = ""
  @Field var amount: String = ""
  @Field var currency: String = ""
  @Field var sender: String = ""
  @Field var date: Double?
  @Field var processingStatus: String = "pending"
}

public final class ExpoWidgetsModule: Module {

  public func definition() -> ModuleDefinition {
    Name("ExpoWidgets")

    AsyncFunction("syncWidgetData") { (snapshot: [String: Any]) in
      guard let defaults = UserDefaults(suiteName: WidgetConstants.appGroupId) else {
        logger.error("Failed to open UserDefaults for app group")
        return
      }

      // ---- safeToSpend ------------------------------------------------
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

      // ---- theme -------------------------------------------------------
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

      // ---- privacy -----------------------------------------------------
      if let isPrivacyEnabled = snapshot["isPrivacyEnabled"] as? Bool {
        defaults.set(isPrivacyEnabled, forKey: "widget_is_privacy_enabled")
      } else {
        defaults.set(false, forKey: "widget_is_privacy_enabled")
      }

      // ---- streak ------------------------------------------------------
      if let streak = snapshot["streak"] as? [String: Any] {
        defaults.set(streak["count"] as? Int ?? 0, forKey: "streak_count")
        defaults.set(streak["todayLogged"] as? Bool ?? false, forKey: "streak_today_logged")
        defaults.set(streak["lastLoggedDate"] as? String ?? "", forKey: "streak_last_logged_date")
        defaults.set(streak["canRecover"] as? Bool ?? false, forKey: "streak_can_recover")
        defaults.set(streak["missedDays"] as? Int ?? 0, forKey: "streak_missed_days")
      } else {
        defaults.removeObject(forKey: "streak_count")
        defaults.removeObject(forKey: "streak_today_logged")
        defaults.removeObject(forKey: "streak_last_logged_date")
        defaults.removeObject(forKey: "streak_can_recover")
        defaults.removeObject(forKey: "streak_missed_days")
      }

      // ---- pet ---------------------------------------------------------
      if let pet = snapshot["pet"] as? [String: Any] {
        defaults.set(pet["health"] as? Int ?? 100, forKey: "pet_health")
        defaults.set(pet["mood"] as? String ?? "happy", forKey: "pet_mood")
      } else {
        defaults.removeObject(forKey: "pet_health")
        defaults.removeObject(forKey: "pet_mood")
      }

      // ---- pendingSms --------------------------------------------------
      if let pendingSms = snapshot["pendingSms"] as? [[String: Any]] {
        let count = min(pendingSms.count, 5)
        defaults.set(count, forKey: "pending_sms_count")
        var currentIds: [String] = []

        for i in 0..<count {
          let item = pendingSms[i]
          let id = item["id"] as? String ?? "\(i)"
          let merchant = item["merchant"] as? String ?? ""
          let amount = (item["amount"] as? NSNumber)?.doubleValue ?? 0
          let amountStr = String(format: "%.2f", amount)
          let currency = item["currency"] as? String ?? ""

          currentIds.append(id)

          // Set indexed keys
          defaults.set(id, forKey: "pending_sms_\(i)_id")
          defaults.set(merchant, forKey: "pending_sms_\(i)_merchant")
          defaults.set(amountStr, forKey: "pending_sms_\(i)_amount")
          defaults.set(currency, forKey: "pending_sms_\(i)_currency")

          // Set PendingSmsKeys contract
          defaults.set(merchant, forKey: PendingSmsKeys.merchant(for: id))
          defaults.set(amountStr, forKey: PendingSmsKeys.amount(for: id))
          defaults.set(currency, forKey: PendingSmsKeys.currency(for: id))
        }

        if let encoded = try? JSONEncoder().encode(currentIds) {
          defaults.set(encoded, forKey: PendingSmsKeys.records)
        }

        // Clear stale slots beyond the current count
        for i in count..<5 {
          defaults.removeObject(forKey: "pending_sms_\(i)_id")
          defaults.removeObject(forKey: "pending_sms_\(i)_merchant")
          defaults.removeObject(forKey: "pending_sms_\(i)_amount")
          defaults.removeObject(forKey: "pending_sms_\(i)_currency")
        }
      } else {
        defaults.removeObject(forKey: "pending_sms_count")
        defaults.removeObject(forKey: PendingSmsKeys.records)
        for i in 0..<5 {
          defaults.removeObject(forKey: "pending_sms_\(i)_id")
          defaults.removeObject(forKey: "pending_sms_\(i)_merchant")
          defaults.removeObject(forKey: "pending_sms_\(i)_amount")
          defaults.removeObject(forKey: "pending_sms_\(i)_currency")
        }
      }

      // ---- pet ---------------------------------------------------------
      if let pet = snapshot["pet"] as? [String: Any] {
        defaults.set(pet["health"] as? Int ?? 50, forKey: "pet_health")
        defaults.set(pet["mood"] as? String ?? "happy", forKey: "pet_mood")
        defaults.set(pet["level"] as? Int ?? 1, forKey: "pet_level")
      } else {
        defaults.removeObject(forKey: "pet_health")
        defaults.removeObject(forKey: "pet_mood")
        defaults.removeObject(forKey: "pet_level")
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
    AsyncFunction("storePendingSms") { (records: [PendingSmsRecord]) in
      guard let defaults = UserDefaults(suiteName: WidgetConstants.appGroupId) else {
        return
      }

      // Filter only pending records and sort by recency (newest date first; null date -> 0.0)
      let pendingRecords = records
        .filter { $0.processingStatus == "pending" }
        .sorted { ($0.date ?? 0.0) > ($1.date ?? 0.0) }

      // Collect all existing record IDs (for cleanup of stale entries)
      let existingRecordsData = defaults.data(forKey: PendingSmsKeys.records)
      let decoder = JSONDecoder()
      var previousIds = Set<String>()
      if let existingData = existingRecordsData {
        do {
          let ids = try decoder.decode([String].self, from: existingData)
          previousIds = Set(ids)
        } catch {
          os_log(.error, "[ExpoWidgets] Failed to decode pending_sms_records: %{public}@", error.localizedDescription)
        }
      }

      var currentIds: [String] = []
      var cleanIds = Set<String>()

      for record in pendingRecords {
        let id = record.id
        guard !id.isEmpty else { continue }
        currentIds.append(id)
        cleanIds.insert(id)

        defaults.set(record.merchant, forKey: PendingSmsKeys.merchant(for: id))
        defaults.set(record.amount, forKey: PendingSmsKeys.amount(for: id))
        defaults.set(record.currency, forKey: PendingSmsKeys.currency(for: id))
        defaults.set(record.sender, forKey: PendingSmsKeys.sender(for: id))
        defaults.set(record.date ?? 0.0, forKey: PendingSmsKeys.date(for: id))
      }

      // Store the ordered list of record IDs
      let encoder = JSONEncoder()
      do {
        let encoded = try encoder.encode(currentIds)
        defaults.set(encoded, forKey: PendingSmsKeys.records)
      } catch {
        os_log(.error, "[ExpoWidgets] Failed to encode pending_sms_records: %{public}@", error.localizedDescription)
      }

      // Clean up stale entries that are no longer in the new records
      let staleIds = previousIds.subtracting(cleanIds)
      for staleId in staleIds {
        defaults.removeObject(forKey: PendingSmsKeys.merchant(for: staleId))
        defaults.removeObject(forKey: PendingSmsKeys.amount(for: staleId))
        defaults.removeObject(forKey: PendingSmsKeys.currency(for: staleId))
        defaults.removeObject(forKey: PendingSmsKeys.sender(for: staleId))
        defaults.removeObject(forKey: PendingSmsKeys.date(for: staleId))
      }

      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }
  }
}

