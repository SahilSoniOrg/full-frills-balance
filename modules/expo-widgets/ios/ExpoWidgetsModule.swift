import ExpoModulesCore
import WidgetKit

public final class ExpoWidgetsModule: Module {
  private let appGroupId = "group.in.sahilsoni.fullfrillsbalance.widgets"

  private static let safeToSpendKeys = [
    "safe_to_spend_amount", "safe_to_spend_currency", "safe_to_spend_formatted_amount",
    "safe_to_spend_title", "safe_to_spend_subtitle", "safe_to_spend_updated_at",
  ]
  private static let safeToSpendByWorkplaceKey = "safe_to_spend_by_workplace"
  private static let activeWorkplaceKey = "widget_active_workplace_id"
  private static let workplaceCatalogKey = "widget_workplace_catalog"
  private static let themeKeys = [
    "widget_theme_id", "widget_theme_mode", "widget_theme_background_start",
    "widget_theme_title_color", "widget_theme_primary_text_color",
    "widget_theme_secondary_text_color", "widget_theme_action_icon_color",
    "widget_theme_income_accent_color", "widget_theme_expense_accent_color",
    "widget_theme_transfer_accent_color",
  ]
  private static let privacyKey = "widget_is_privacy_enabled"

  public func definition() -> ModuleDefinition {
    Name("ExpoWidgets")

    AsyncFunction("syncWidgetData") { (snapshot: [String: Any]) in
      guard let defaults = UserDefaults(suiteName: self.appGroupId) else {
        return
      }

      if let workplaceId = snapshot["workplaceId"] as? String, !workplaceId.isEmpty {
        let providedSnapshots = snapshot["safeToSpendByWorkplace"] as? [String: [String: Any]]
        var snapshots = providedSnapshots ?? defaults.dictionary(forKey: ExpoWidgetsModule.safeToSpendByWorkplaceKey)
          as? [String: [String: Any]] ?? [:]
        if let safeToSpend = snapshot["safeToSpend"] as? [String: Any] {
          snapshots[workplaceId] = safeToSpend
        } else if providedSnapshots == nil {
          snapshots.removeValue(forKey: workplaceId)
        }
        defaults.set(snapshots, forKey: ExpoWidgetsModule.safeToSpendByWorkplaceKey)
        defaults.set(workplaceId, forKey: ExpoWidgetsModule.activeWorkplaceKey)
        if let workplaces = snapshot["workplaces"] as? [[String: String]] {
          defaults.set(workplaces, forKey: ExpoWidgetsModule.workplaceCatalogKey)
        }
        ExpoWidgetsModule.safeToSpendKeys.forEach { defaults.removeObject(forKey: $0) }
      } else if let safeToSpend = snapshot["safeToSpend"] as? [String: Any] {
        defaults.set((safeToSpend["amount"] as? NSNumber)?.doubleValue ?? 0, forKey: "safe_to_spend_amount")
        defaults.set(safeToSpend["currencyCode"] as? String ?? "", forKey: "safe_to_spend_currency")
        defaults.set(safeToSpend["formattedAmount"] as? String ?? "", forKey: "safe_to_spend_formatted_amount")
        defaults.set(safeToSpend["title"] as? String ?? "", forKey: "safe_to_spend_title")
        defaults.set(safeToSpend["subtitle"] as? String ?? "", forKey: "safe_to_spend_subtitle")
        defaults.set((safeToSpend["updatedAt"] as? NSNumber)?.doubleValue ?? Date().timeIntervalSince1970 * 1000, forKey: "safe_to_spend_updated_at")
      } else {
        ExpoWidgetsModule.safeToSpendKeys.forEach { defaults.removeObject(forKey: $0) }
      }

      if let theme = snapshot["theme"] as? [String: Any] {
        defaults.set(theme["themeId"] as? String ?? "", forKey: "widget_theme_id")
        defaults.set(theme["themeMode"] as? String ?? "", forKey: "widget_theme_mode")
        defaults.set(theme["backgroundStartColor"] as? String ?? "", forKey: "widget_theme_background_start")
        defaults.set(theme["titleColor"] as? String ?? "", forKey: "widget_theme_title_color")
        defaults.set(theme["primaryTextColor"] as? String ?? "", forKey: "widget_theme_primary_text_color")
        defaults.set(theme["secondaryTextColor"] as? String ?? "", forKey: "widget_theme_secondary_text_color")
        defaults.set(theme["actionIconColor"] as? String ?? "", forKey: "widget_theme_action_icon_color")
        defaults.set(theme["incomeAccentColor"] as? String ?? "", forKey: "widget_theme_income_accent_color")
        defaults.set(theme["expenseAccentColor"] as? String ?? "", forKey: "widget_theme_expense_accent_color")
        defaults.set(theme["transferAccentColor"] as? String ?? "", forKey: "widget_theme_transfer_accent_color")
      } else {
        ExpoWidgetsModule.themeKeys.forEach { defaults.removeObject(forKey: $0) }
      }
      defaults.removeObject(forKey: "widget_theme_background_end")

      if let isPrivacyEnabled = snapshot["isPrivacyEnabled"] as? Bool {
        defaults.set(isPrivacyEnabled, forKey: ExpoWidgetsModule.privacyKey)
      } else {
        defaults.set(false, forKey: ExpoWidgetsModule.privacyKey)
      }

      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    AsyncFunction("clearWidgetData") {
      // Without the app group, sync cannot have stored anything for the widget to read.
      guard let defaults = UserDefaults(suiteName: self.appGroupId) else {
        return
      }
      (ExpoWidgetsModule.safeToSpendKeys + ExpoWidgetsModule.themeKeys + [
        ExpoWidgetsModule.privacyKey,
        "widget_theme_background_end",
        ExpoWidgetsModule.safeToSpendByWorkplaceKey,
        ExpoWidgetsModule.activeWorkplaceKey,
        ExpoWidgetsModule.workplaceCatalogKey,
      ])
        .forEach { defaults.removeObject(forKey: $0) }
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    AsyncFunction("clearWidgetWorkplaceData") { (workplaceId: String, activeWorkplaceId: String?) in
      guard let defaults = UserDefaults(suiteName: self.appGroupId) else {
        return
      }
      var snapshots = defaults.dictionary(forKey: ExpoWidgetsModule.safeToSpendByWorkplaceKey)
        as? [String: [String: Any]] ?? [:]
      snapshots.removeValue(forKey: workplaceId)
      defaults.set(snapshots, forKey: ExpoWidgetsModule.safeToSpendByWorkplaceKey)

      let workplaces = (defaults.array(forKey: ExpoWidgetsModule.workplaceCatalogKey) as? [[String: String]] ?? [])
        .filter { $0["id"] != workplaceId }
      defaults.set(workplaces, forKey: ExpoWidgetsModule.workplaceCatalogKey)

      let currentActiveWorkplaceId = defaults.string(forKey: ExpoWidgetsModule.activeWorkplaceKey)
      let nextActiveWorkplaceId: String?
      if activeWorkplaceId == workplaceId || (activeWorkplaceId == nil && currentActiveWorkplaceId == workplaceId) {
        nextActiveWorkplaceId = nil
      } else {
        nextActiveWorkplaceId = activeWorkplaceId ?? currentActiveWorkplaceId
      }
      if let nextActiveWorkplaceId {
        defaults.set(nextActiveWorkplaceId, forKey: ExpoWidgetsModule.activeWorkplaceKey)
      } else {
        defaults.removeObject(forKey: ExpoWidgetsModule.activeWorkplaceKey)
      }

      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
