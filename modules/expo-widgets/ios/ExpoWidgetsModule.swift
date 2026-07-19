import ExpoModulesCore
import WidgetKit
import os.log

private let logger = Logger(subsystem: "in.sahilsoni.fullfrillsbalance", category: "ExpoWidgets")

public final class ExpoWidgetsModule: Module {
  private let appGroupId = "group.in.sahilsoni.fullfrillsbalance.widgets"

  public func definition() -> ModuleDefinition {
    Name("ExpoWidgets")

    AsyncFunction("syncWidgetData") { (snapshot: [String: Any]) in
      guard let defaults = UserDefaults(suiteName: self.appGroupId) else {
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

      // ---- pendingSms --------------------------------------------------
      if let pendingSms = snapshot["pendingSms"] as? [[String: Any]] {
        let count = min(pendingSms.count, 5)
        defaults.set(count, forKey: "pending_sms_count")
        for i in 0..<count {
          let item = pendingSms[i]
          defaults.set(item["id"] as? String ?? "", forKey: "pending_sms_\(i)_id")
          defaults.set(item["merchant"] as? String ?? "", forKey: "pending_sms_\(i)_merchant")
          defaults.set((item["amount"] as? NSNumber)?.doubleValue ?? 0, forKey: "pending_sms_\(i)_amount")
          defaults.set(item["currency"] as? String ?? "", forKey: "pending_sms_\(i)_currency")
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
  }
}
