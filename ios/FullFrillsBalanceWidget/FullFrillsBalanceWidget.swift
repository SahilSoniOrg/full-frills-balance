import SwiftUI
import WidgetKit

private let appScheme = "fullfrillsbalance" // expo-inject-appscheme
private let incomeLaunchURL = URL(string: appScheme + "://journal-entry?mode=simple&type=income&source=widget")!
private let expenseLaunchURL = URL(string: appScheme + "://journal-entry?mode=simple&type=expense&source=widget")!
private let transferLaunchURL = URL(string: appScheme + "://journal-entry?mode=simple&type=transfer&source=widget")!
private let appGroupId = AppGroupId // expo-inject-iosappgroup

struct SafeToSpendSnapshot {
  let amount: Double
  let currencyCode: String
  let formattedAmount: String
  let title: String
  let subtitle: String
  let updatedAt: Date?

  static func load() -> SafeToSpendSnapshot? {
    guard let defaults = UserDefaults(suiteName: appGroupId) else {
      return nil
    }

    guard let formattedAmount = defaults.string(forKey: "safe_to_spend_formatted_amount") else {
      return nil
    }

    let timestampMs = defaults.double(forKey: "safe_to_spend_updated_at")
    let updatedAt = timestampMs > 0 ? Date(timeIntervalSince1970: timestampMs / 1000.0) : nil

    return SafeToSpendSnapshot(
      amount: defaults.double(forKey: "safe_to_spend_amount"),
      currencyCode: defaults.string(forKey: "safe_to_spend_currency") ?? "",
      formattedAmount: formattedAmount,
      title: defaults.string(forKey: "safe_to_spend_title") ?? "Safe to spend",
      subtitle: defaults.string(forKey: "safe_to_spend_subtitle") ?? "After obligations",
      updatedAt: updatedAt
    )
  }
}

struct WidgetThemeSnapshot {
  let themeId: String
  let themeMode: String
  let backgroundStartColor: Color
  let backgroundEndColor: Color
  let titleColor: Color
  let primaryTextColor: Color
  let secondaryTextColor: Color
  let actionIconColor: Color
  let incomeAccentColor: Color
  let expenseAccentColor: Color
  let transferAccentColor: Color

  static func load() -> WidgetThemeSnapshot? {
    guard let defaults = UserDefaults(suiteName: appGroupId) else {
      return nil
    }

    guard
      let themeId = defaults.string(forKey: "widget_theme_id"),
      let backgroundStart = Color(hexString: defaults.string(forKey: "widget_theme_background_start")),
      let backgroundEnd = Color(hexString: defaults.string(forKey: "widget_theme_background_end")),
      let titleColor = Color(hexString: defaults.string(forKey: "widget_theme_title_color")),
      let primaryTextColor = Color(hexString: defaults.string(forKey: "widget_theme_primary_text_color")),
      let secondaryTextColor = Color(hexString: defaults.string(forKey: "widget_theme_secondary_text_color")),
      let actionIconColor = Color(hexString: defaults.string(forKey: "widget_theme_action_icon_color")),
      let incomeAccentColor = Color(hexString: defaults.string(forKey: "widget_theme_income_accent_color")),
      let expenseAccentColor = Color(hexString: defaults.string(forKey: "widget_theme_expense_accent_color")),
      let transferAccentColor = Color(hexString: defaults.string(forKey: "widget_theme_transfer_accent_color"))
    else {
      return nil
    }

    return WidgetThemeSnapshot(
      themeId: themeId,
      themeMode: defaults.string(forKey: "widget_theme_mode") ?? "dark",
      backgroundStartColor: backgroundStart,
      backgroundEndColor: backgroundEnd,
      titleColor: titleColor,
      primaryTextColor: primaryTextColor,
      secondaryTextColor: secondaryTextColor,
      actionIconColor: actionIconColor,
      incomeAccentColor: incomeAccentColor,
      expenseAccentColor: expenseAccentColor,
      transferAccentColor: transferAccentColor
    )
  }

  static let fallback = WidgetThemeSnapshot(
    themeId: "deep-space",
    themeMode: "dark",
    backgroundStartColor: Color(hex: 0x1E1E26),
    backgroundEndColor: Color(hex: 0x1E1E26),
    titleColor: Color(hex: 0x7DD3A8),
    primaryTextColor: .white,
    secondaryTextColor: Color(hex: 0x8A8694),
    actionIconColor: Color(hex: 0x7DD3A8),
    incomeAccentColor: Color(hex: 0xDDF6E5),
    expenseAccentColor: Color(hex: 0xFDE5E3),
    transferAccentColor: Color(hex: 0xE6F4FE)
  )
}

struct JournalLauncherEntry: TimelineEntry {
  let date: Date
  let safeToSpend: SafeToSpendSnapshot?
  let theme: WidgetThemeSnapshot
  let isPrivacyEnabled: Bool
}

struct JournalLauncherProvider: TimelineProvider {
  func placeholder(in context: Context) -> JournalLauncherEntry {
    JournalLauncherEntry(
      date: Date(),
      safeToSpend: SafeToSpendSnapshot(
        amount: 3240,
        currencyCode: "USD",
        formattedAmount: "$3,240",
        title: "Safe to spend",
        subtitle: "After obligations",
        updatedAt: Date()
      ),
      theme: .fallback,
      isPrivacyEnabled: false
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (JournalLauncherEntry) -> Void) {
    let defaults = UserDefaults(suiteName: appGroupId)
    completion(
      JournalLauncherEntry(
        date: Date(),
        safeToSpend: SafeToSpendSnapshot.load(),
        theme: WidgetThemeSnapshot.load() ?? .fallback,
        isPrivacyEnabled: defaults?.bool(forKey: "widget_is_privacy_enabled") ?? false
      )
    )
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<JournalLauncherEntry>) -> Void) {
    let defaults = UserDefaults(suiteName: appGroupId)
    completion(
      Timeline(
        entries: [
          JournalLauncherEntry(
            date: Date(),
            safeToSpend: SafeToSpendSnapshot.load(),
            theme: WidgetThemeSnapshot.load() ?? .fallback,
            isPrivacyEnabled: defaults?.bool(forKey: "widget_is_privacy_enabled") ?? false
          )
        ],
        policy: .never
      )
    )
  }
}

struct JournalLauncherWidgetView: View {
  @Environment(\.widgetFamily) private var family
  var entry: JournalLauncherProvider.Entry

  var body: some View {
    widgetContent
  }

  @ViewBuilder
  private var widgetContent: some View {
    let theme = entry.theme
    let content = Group {
      switch family {
      case .systemSmall:
        launcherActions(spacing: 6, iconSize: 38, titleSize: 9, containerSpacing: 8, showsHeading: false)
      case .systemMedium:
        mediumLayout
      case .accessoryCircular:
        accessoryCircularView
      case .accessoryRectangular:
        accessoryRectangularView
      case .accessoryInline:
        accessoryInlineView
      default:
        largeLayout
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(family == .systemSmall ? 10 : 14)

    if #available(iOS 17.0, *) {
      content
        .containerBackground(for: .widget) {
          theme.backgroundStartColor
        }
    } else {
      content
        .background(theme.backgroundStartColor)
    }
  }

  private var mediumLayout: some View {
    HStack(spacing: 14) {
      safeToSpendPanel(amountFontSize: 26, titleSize: 11, subtitleSize: 11)
        .frame(maxWidth: .infinity, alignment: .leading)

      launcherActions(spacing: 8, iconSize: 40, titleSize: 9, containerSpacing: 10, showsHeading: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private var largeLayout: some View {
    VStack(alignment: .leading, spacing: 16) {
      safeToSpendPanel(amountFontSize: 32, titleSize: 12, subtitleSize: 12)

      Divider()
        .overlay(entry.theme.secondaryTextColor.opacity(0.18))

      launcherActions(spacing: 10, iconSize: 46, titleSize: 10, containerSpacing: 12, showsHeading: true)
    }
  }

  private func launcherActions(
    spacing: CGFloat,
    iconSize: CGFloat,
    titleSize: CGFloat,
    containerSpacing: CGFloat,
    showsHeading: Bool
  ) -> some View {
    VStack(alignment: .leading, spacing: containerSpacing) {
      if showsHeading {
        Text("Add transaction")
          .font(.system(size: 11, weight: .semibold, design: .rounded))
          .foregroundStyle(entry.theme.secondaryTextColor)
      }

      HStack(spacing: spacing) {
        actionLink(
          title: "Income",
          systemImage: "arrow.down.left.circle.fill",
          accent: entry.theme.incomeAccentColor,
          destination: incomeLaunchURL,
          iconSize: iconSize,
          titleSize: titleSize
        )
        actionLink(
          title: "Expense",
          systemImage: "arrow.up.right.circle.fill",
          accent: entry.theme.expenseAccentColor,
          destination: expenseLaunchURL,
          iconSize: iconSize,
          titleSize: titleSize
        )
        actionLink(
          title: "Transfer",
          systemImage: "arrow.left.arrow.right.circle.fill",
          accent: entry.theme.transferAccentColor,
          destination: transferLaunchURL,
          iconSize: iconSize,
          titleSize: titleSize
        )
      }
    }
  }

  private func safeToSpendPanel(amountFontSize: CGFloat, titleSize: CGFloat, subtitleSize: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(entry.safeToSpend?.title.uppercased() ?? "SAFE TO SPEND")
        .font(.system(size: titleSize, weight: .bold, design: .rounded))
        .foregroundStyle(entry.theme.titleColor)

      let displayAmount = entry.isPrivacyEnabled ? "****" : (entry.safeToSpend?.formattedAmount ?? "--")
      Text(displayAmount)
        .font(.system(size: amountFontSize, weight: .bold, design: .rounded))
        .foregroundStyle(entry.theme.primaryTextColor)
        .lineLimit(1)
        .minimumScaleFactor(0.75)

      Text(entry.safeToSpend?.subtitle ?? "Open the app to load data")
        .font(.system(size: subtitleSize, weight: .medium, design: .rounded))
        .foregroundStyle(entry.theme.secondaryTextColor)
        .lineLimit(2)
        .minimumScaleFactor(0.8)
    }
  }

  private func actionLink(title: String, systemImage: String, accent: Color, destination: URL, iconSize: CGFloat, titleSize: CGFloat) -> some View {
    Link(destination: destination) {
      VStack(spacing: 6) {
        ZStack {
          Circle()
            .fill(accent)

          Image(systemName: systemImage)
            .font(.system(size: iconSize * 0.42, weight: .semibold))
            .foregroundStyle(entry.theme.actionIconColor)
        }
        .frame(width: iconSize, height: iconSize)

        Text(title)
          .font(.system(size: titleSize, weight: .semibold, design: .rounded))
          .foregroundStyle(entry.theme.primaryTextColor)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .buttonStyle(.plain)
  }

  @ViewBuilder
  private var accessoryCircularView: some View {
    ZStack {
      Circle()
        .stroke(entry.theme.titleColor, lineWidth: 2)
      
      VStack(spacing: 0) {
        let displayAmount = entry.isPrivacyEnabled ? "****" : (entry.safeToSpend?.formattedAmount ?? "--")
        Text(displayAmount)
          .font(.system(size: 10, weight: .bold, design: .rounded))
          .minimumScaleFactor(0.5)
      }
    }
  }

  @ViewBuilder
  private var accessoryRectangularView: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(entry.safeToSpend?.title.uppercased() ?? "SAFE TO SPEND")
        .font(.system(size: 10, weight: .bold, design: .rounded))
        .foregroundStyle(entry.theme.titleColor)
      
      let displayAmount = entry.isPrivacyEnabled ? "****" : (entry.safeToSpend?.formattedAmount ?? "--")
      Text(displayAmount)
        .font(.system(size: 16, weight: .bold, design: .rounded))
      
      Text(entry.safeToSpend?.subtitle ?? "")
        .font(.system(size: 9, weight: .medium, design: .rounded))
        .opacity(0.8)
    }
  }

  @ViewBuilder
  private var accessoryInlineView: some View {
    let displayAmount = entry.isPrivacyEnabled ? "****" : (entry.safeToSpend?.formattedAmount ?? "--")
    Text("\(entry.safeToSpend?.title ?? "Balance"): \(displayAmount)")
  }
}

// MARK: - Journal Launcher Widget

struct FullFrillsBalanceWidget: Widget {
  let kind: String = "FullFrillsBalanceJournalLauncher"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: JournalLauncherProvider()) { entry in
      JournalLauncherWidgetView(entry: entry)
    }
    .configurationDisplayName("New Journal")
    .description("Launch transaction journal creation directly from the home screen.")
    .supportedFamilies([
      .systemSmall,
      .systemMedium,
      .systemLarge,
      .accessoryCircular,
      .accessoryRectangular,
      .accessoryInline,
    ])
  }
}

// MARK: - SMS Triage Widget

struct PendingSmsItem: Identifiable {
  let id: String
  let merchant: String
  let amount: String
  let currency: String
  let sender: String
  let updatedAt: Date?
}

struct PendingSmsSnapshot {
  static func load() -> [PendingSmsItem] {
    guard let defaults = UserDefaults(suiteName: appGroupId) else { return [] }

    guard let recordsData = defaults.data(forKey: PendingSmsKeys.records) else { return [] }

    let decoder = JSONDecoder()
    guard let recordIds = try? decoder.decode([String].self, from: recordsData) else { return [] }

    let items = recordIds.compactMap { recordId -> PendingSmsItem? in
      let merchant = defaults.string(forKey: PendingSmsKeys.merchant(for: recordId)) ?? "Unknown"
      let amount = defaults.string(forKey: PendingSmsKeys.amount(for: recordId)) ?? "--"
      guard !merchant.isEmpty, !amount.isEmpty else { return nil }

      let currency = defaults.string(forKey: PendingSmsKeys.currency(for: recordId)) ?? ""
      let sender = defaults.string(forKey: PendingSmsKeys.sender(for: recordId)) ?? ""
      let timestampMs = defaults.double(forKey: PendingSmsKeys.date(for: recordId))
      let updatedAt = timestampMs > 0 ? Date(timeIntervalSince1970: timestampMs / 1000.0) : nil

      return PendingSmsItem(
        id: recordId,
        merchant: merchant,
        amount: amount,
        currency: currency,
        sender: sender,
        updatedAt: updatedAt
      )
    }

    return items.sorted { ($0.updatedAt ?? Date.distantPast) > ($1.updatedAt ?? Date.distantPast) }
  }
}

struct SmsTriageEntry: TimelineEntry {
  let date: Date
  let pendingItems: [PendingSmsItem]
  let theme: WidgetThemeSnapshot
}

struct SmsTriageProvider: TimelineProvider {
  func placeholder(in context: Context) -> SmsTriageEntry {
    SmsTriageEntry(
      date: Date(),
      pendingItems: [
        PendingSmsItem(
          id: "placeholder",
          merchant: "Example Store",
          amount: "$42.50",
          currency: "USD",
          sender: "EXAMPL",
          updatedAt: Date()
        ),
      ],
      theme: .fallback
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (SmsTriageEntry) -> Void) {
    completion(SmsTriageEntry(date: Date(), pendingItems: PendingSmsSnapshot.load(), theme: WidgetThemeSnapshot.load() ?? .fallback))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<SmsTriageEntry>) -> Void) {
    completion(
      Timeline(
        entries: [SmsTriageEntry(date: Date(), pendingItems: PendingSmsSnapshot.load(), theme: WidgetThemeSnapshot.load() ?? .fallback)],
        policy: .never
      )
    )
  }
}

struct SmsTriageWidgetView: View {
  @Environment(\.widgetFamily) private var family
  var entry: SmsTriageProvider.Entry

  var body: some View {
    widgetContent
  }

  @ViewBuilder
  private var widgetContent: some View {
    let content = Group {
      if entry.pendingItems.isEmpty {
        emptyState
      } else {
        switch family {
        case .systemSmall:
          smallLayout
        default:
          mediumLayout
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(14)

    if #available(iOS 17.0, *) {
      content
        .containerBackground(for: .widget) {
          entry.theme.backgroundStartColor
        }
    } else {
      content
        .background(entry.theme.backgroundStartColor)
    }
  }

  private var emptyState: some View {
    VStack(spacing: 8) {
      Image(systemName: "tray")
        .font(.system(size: 28, weight: .light))
        .foregroundStyle(entry.theme.secondaryTextColor)

      Text("No pending SMS")
        .font(.system(size: 13, weight: .medium, design: .rounded))
        .foregroundStyle(entry.theme.secondaryTextColor)
    }
  }

  private var smallLayout: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("SMS Inbox")
        .font(.system(size: 11, weight: .bold, design: .rounded))
        .foregroundStyle(entry.theme.titleColor)

      let displayItems = Array(entry.pendingItems.prefix(2))
      ForEach(displayItems) { item in
        pendingSmsRow(item: item, compact: true)
      }

      if entry.pendingItems.count > 2 {
        Text("+\\(entry.pendingItems.count - 2) more")
          .font(.system(size: 9, weight: .medium, design: .rounded))
          .foregroundStyle(entry.theme.secondaryTextColor)
      }
    }
  }

  private var mediumLayout: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("SMS Inbox")
        .font(.system(size: 12, weight: .bold, design: .rounded))
        .foregroundStyle(entry.theme.titleColor)

      let displayItems = Array(entry.pendingItems.prefix(3))
      ForEach(displayItems) { item in
        pendingSmsRow(item: item, compact: false)
      }

      if entry.pendingItems.count > 3 {
        Text("+\\(entry.pendingItems.count - 3) more")
          .font(.system(size: 10, weight: .medium, design: .rounded))
          .foregroundStyle(entry.theme.secondaryTextColor)
      }
    }
  }

  private func pendingSmsRow(item: PendingSmsItem, compact: Bool) -> some View {
    HStack(spacing: 8) {
      Text(item.merchant)
        .font(.system(size: compact ? 11 : 12, weight: .semibold, design: .rounded))
        .foregroundStyle(entry.theme.primaryTextColor)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)

      Text(item.amount)
        .font(.system(size: compact ? 12 : 14, weight: .bold, design: .rounded))
        .foregroundStyle(entry.theme.primaryTextColor)

      if #available(iOS 17.0, *) {
        Button(intent: SmsQuickImportIntent(recordId: item.id)) {
          Image(systemName: "arrow.right.circle.fill")
            .font(.system(size: compact ? 18 : 22, weight: .semibold))
            .foregroundStyle(entry.theme.actionIconColor)
        }
        .buttonStyle(.plain)
      } else {
        Link(destination: URL(string: "\(appScheme)://inbox?approve=\(item.id)")!) {
          Image(systemName: "arrow.right.circle.fill")
            .font(.system(size: compact ? 18 : 22, weight: .semibold))
            .foregroundStyle(entry.theme.actionIconColor)
        }
      }
    }
    .padding(.horizontal, 8)
    .padding(.vertical, compact ? 4 : 6)
    .background(entry.theme.primaryTextColor.opacity(0.07))
    .cornerRadius(8)
  }
}

struct SmsTriageWidget: Widget {
  let kind: String = "FullFrillsBalanceSmsTriage"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: SmsTriageProvider()) { entry in
      SmsTriageWidgetView(entry: entry)
    }
    .configurationDisplayName("SMS Triage")
    .description("Quick-import pending SMS transactions.")
    .supportedFamilies([
      .systemSmall,
      .systemMedium,
    ])
  }
}

// MARK: - Widget Bundle

#if WIDGET
@main
struct FullFrillsBalanceWidgetBundle: WidgetBundle {
  var body: some Widget {
    FullFrillsBalanceWidget()
    SmsTriageWidget()
  }
}
#endif

private extension Color {
  init(hex: UInt32) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255.0,
      green: Double((hex >> 8) & 0xFF) / 255.0,
      blue: Double(hex & 0xFF) / 255.0,
      opacity: 1.0
    )
  }

  init?(hexString: String?) {
    guard let hexString else {
      return nil
    }

    let sanitized = hexString.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    var value: UInt64 = 0

    guard Scanner(string: sanitized).scanHexInt64(&value) else {
      return nil
    }

    switch sanitized.count {
    case 6:
      self.init(
        .sRGB,
        red: Double((value >> 16) & 0xFF) / 255.0,
        green: Double((value >> 8) & 0xFF) / 255.0,
        blue: Double(value & 0xFF) / 255.0,
        opacity: 1.0
      )
    case 8:
      self.init(
        .sRGB,
        red: Double((value >> 16) & 0xFF) / 255.0,
        green: Double((value >> 8) & 0xFF) / 255.0,
        blue: Double(value & 0xFF) / 255.0,
        opacity: Double((value >> 24) & 0xFF) / 255.0
      )
    default:
      return nil
    }
  }
}
