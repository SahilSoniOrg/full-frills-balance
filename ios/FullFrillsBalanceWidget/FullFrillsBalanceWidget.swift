import AppIntents
import SwiftUI
import WidgetKit

private let appScheme = "fullfrillsbalance" // expo-inject-appscheme
private let incomeLaunchURL = URL(string: appScheme + "://journal-entry?mode=simple&type=income&source=widget")!
private let expenseLaunchURL = URL(string: appScheme + "://journal-entry?mode=simple&type=expense&source=widget")!
private let transferLaunchURL = URL(string: appScheme + "://journal-entry?mode=simple&type=transfer&source=widget")!
private let homeLaunchURL = URL(string: appScheme + "://widget?source=widget")!
private let appGroupId = "group.in.sahilsoni.fullfrillsbalance.widgets" // expo-inject-iosappgroup
private let workplaceSnapshotsKey = "safe_to_spend_by_workplace"
private let activeWorkplaceKey = "widget_active_workplace_id"
private let workplaceCatalogKey = "widget_workplace_catalog"

private func widgetLaunchURL(_ baseURL: URL, workplaceId: String?) -> URL {
  guard let workplaceId,
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
    return baseURL
  }
  var queryItems = components.queryItems ?? []
  queryItems.removeAll { $0.name == "workplaceId" }
  queryItems.append(URLQueryItem(name: "workplaceId", value: workplaceId))
  components.queryItems = queryItems
  return components.url ?? baseURL
}

struct SafeToSpendSnapshot {
  let amount: Double
  let currencyCode: String
  let formattedAmount: String
  let title: String
  let subtitle: String
  let updatedAt: Date?
  let workplaceName: String?
  let workplaceId: String?

  static func resolveWorkplaceId(workplaceId requestedWorkplaceId: String? = nil) -> String? {
    guard let defaults = UserDefaults(suiteName: appGroupId) else {
      return nil
    }

    let catalog = defaults.array(forKey: workplaceCatalogKey) as? [[String: String]] ?? []
    let catalogById: [String: String] = Dictionary(uniqueKeysWithValues: catalog.compactMap { workplace -> (String, String)? in
      guard let id = workplace["id"] else { return nil }
      return (id, workplace["name"] ?? id)
    })
    let activeWorkplaceId = defaults.string(forKey: activeWorkplaceKey)
    let fallbackWorkplaceId = activeWorkplaceId.flatMap { id in
      catalog.isEmpty || catalogById[id] != nil ? id : nil
    }

    guard let requestedWorkplaceId else { return fallbackWorkplaceId }
    return catalog.isEmpty || catalogById[requestedWorkplaceId] != nil
      ? requestedWorkplaceId
      : fallbackWorkplaceId
  }

  static func resolveWorkplaceName(workplaceId requestedWorkplaceId: String? = nil) -> String? {
    guard let defaults = UserDefaults(suiteName: appGroupId) else {
      return nil
    }
    guard let workplaceId = resolveWorkplaceId(workplaceId: requestedWorkplaceId) else {
      return nil
    }

    let catalog = defaults.array(forKey: workplaceCatalogKey) as? [[String: String]] ?? []
    return catalog.first { $0["id"] == workplaceId }?["name"]
  }

  static func load(workplaceId requestedWorkplaceId: String? = nil) -> SafeToSpendSnapshot? {
    guard let defaults = UserDefaults(suiteName: appGroupId) else {
      return nil
    }

    let catalog = defaults.array(forKey: workplaceCatalogKey) as? [[String: String]] ?? []
    let catalogById: [String: String] = Dictionary(uniqueKeysWithValues: catalog.compactMap { workplace -> (String, String)? in
      guard let id = workplace["id"] else { return nil }
      return (id, workplace["name"] ?? id)
    })
    let resolvedWorkplaceId = resolveWorkplaceId(workplaceId: requestedWorkplaceId)
    let snapshots = defaults.dictionary(forKey: workplaceSnapshotsKey) as? [String: [String: Any]] ?? [:]

    if let resolvedWorkplaceId, let snapshot = snapshots[resolvedWorkplaceId],
       let formattedAmount = snapshot["formattedAmount"] as? String {
      let timestampMs = (snapshot["updatedAt"] as? NSNumber)?.doubleValue ?? 0
      let updatedAt = timestampMs > 0 ? Date(timeIntervalSince1970: timestampMs / 1000.0) : nil
      return SafeToSpendSnapshot(
        amount: (snapshot["amount"] as? NSNumber)?.doubleValue ?? 0,
        currencyCode: snapshot["currencyCode"] as? String ?? "",
        formattedAmount: formattedAmount,
        title: snapshot["title"] as? String ?? "Safe to spend",
        subtitle: snapshot["subtitle"] as? String ?? "After obligations",
        updatedAt: updatedAt,
        workplaceName: catalogById[resolvedWorkplaceId],
        workplaceId: resolvedWorkplaceId
      )
    }

    guard resolvedWorkplaceId == nil,
          let formattedAmount = defaults.string(forKey: "safe_to_spend_formatted_amount") else {
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
      updatedAt: updatedAt,
      workplaceName: nil,
      workplaceId: resolvedWorkplaceId
    )
  }
}

struct WidgetThemeSnapshot {
  let themeId: String
  let themeMode: String
  let backgroundStartColor: Color
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
    titleColor: Color(hex: 0x7DD3A8),
    primaryTextColor: .white,
    secondaryTextColor: Color(hex: 0x8A8694),
    actionIconColor: Color(hex: 0x7DD3A8),
    incomeAccentColor: Color(hex: 0xDDF6E5),
    expenseAccentColor: Color(hex: 0xFDE5E3),
    transferAccentColor: Color(hex: 0xE6F4FE)
  )
}

@available(iOSApplicationExtension 17.0, *)
struct WidgetWorkplaceEntity: AppEntity, Identifiable {
  static let activeWorkplaceId = "__active_workplace__"
  static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Workplace")
  static var defaultQuery = WidgetWorkplaceQuery()

  let id: String
  let name: String

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(name)")
  }

  static let active = WidgetWorkplaceEntity(id: activeWorkplaceId, name: "Follow active workplace")
}

@available(iOSApplicationExtension 17.0, *)
struct WidgetWorkplaceQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [WidgetWorkplaceEntity] {
    let workplaces = Self.workplaces()
    return identifiers.compactMap { id in
      if id == WidgetWorkplaceEntity.activeWorkplaceId { return .active }
      return workplaces.first { $0.id == id }
        ?? WidgetWorkplaceEntity(id: id, name: "Follow active workplace")
    }
  }

  func suggestedEntities() async throws -> [WidgetWorkplaceEntity] {
    [.active] + Self.workplaces()
  }

  private static func workplaces() -> [WidgetWorkplaceEntity] {
    let catalog = UserDefaults(suiteName: appGroupId)?.array(forKey: workplaceCatalogKey) as? [[String: String]] ?? []
    return catalog.compactMap { workplace in
      guard let id = workplace["id"] else { return nil }
      return WidgetWorkplaceEntity(id: id, name: workplace["name"] ?? id)
    }
  }
}

@available(iOSApplicationExtension 17.0, *)
struct ConfigureWidgetWorkplaceIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Choose workplace"

  @Parameter(title: "Workplace")
  var workplace: WidgetWorkplaceEntity

  init(workplace: WidgetWorkplaceEntity) {
    self.workplace = workplace
  }

  init() {
    self.workplace = .active
  }
}

struct JournalLauncherEntry: TimelineEntry {
  let date: Date
  let safeToSpend: SafeToSpendSnapshot?
  let workplaceId: String?
  let theme: WidgetThemeSnapshot
  let isPrivacyEnabled: Bool
}

private func makeTimeline(for entry: JournalLauncherEntry) -> Timeline<JournalLauncherEntry> {
  guard let updatedAt = entry.safeToSpend?.updatedAt else {
    return Timeline(entries: [entry], policy: .never)
  }
  let staleAt = updatedAt.addingTimeInterval(24 * 60 * 60)
  guard staleAt > entry.date else {
    return Timeline(entries: [entry], policy: .never)
  }
  let staleEntry = JournalLauncherEntry(
    date: staleAt,
    safeToSpend: entry.safeToSpend,
    workplaceId: entry.workplaceId,
    theme: entry.theme,
    isPrivacyEnabled: entry.isPrivacyEnabled
  )
  return Timeline(entries: [entry, staleEntry], policy: .never)
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
        updatedAt: Date(),
        workplaceName: "Home",
        workplaceId: nil
      ),
      workplaceId: nil,
      theme: .fallback,
      isPrivacyEnabled: false
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (JournalLauncherEntry) -> Void) {
    let defaults = UserDefaults(suiteName: appGroupId)
    let snapshot = SafeToSpendSnapshot.load()
    completion(
      JournalLauncherEntry(
        date: Date(),
        safeToSpend: snapshot,
        workplaceId: snapshot?.workplaceId ?? SafeToSpendSnapshot.resolveWorkplaceId(),
        theme: WidgetThemeSnapshot.load() ?? .fallback,
        isPrivacyEnabled: defaults?.bool(forKey: "widget_is_privacy_enabled") ?? false
      )
    )
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<JournalLauncherEntry>) -> Void) {
    let defaults = UserDefaults(suiteName: appGroupId)
    let snapshot = SafeToSpendSnapshot.load()
    completion(
      makeTimeline(
        for: JournalLauncherEntry(
          date: Date(),
          safeToSpend: snapshot,
          workplaceId: snapshot?.workplaceId ?? SafeToSpendSnapshot.resolveWorkplaceId(),
          theme: WidgetThemeSnapshot.load() ?? .fallback,
          isPrivacyEnabled: defaults?.bool(forKey: "widget_is_privacy_enabled") ?? false
        )
      )
    )
  }
}

@available(iOSApplicationExtension 17.0, *)
struct ConfigurableJournalLauncherProvider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> JournalLauncherEntry {
    JournalLauncherProvider().placeholder(in: context)
  }

  func snapshot(for configuration: ConfigureWidgetWorkplaceIntent, in context: Context) async -> JournalLauncherEntry {
    makeEntry(workplaceId: selectedWorkplaceId(configuration))
  }

  func timeline(for configuration: ConfigureWidgetWorkplaceIntent, in context: Context) async -> Timeline<JournalLauncherEntry> {
    makeTimeline(for: makeEntry(workplaceId: selectedWorkplaceId(configuration)))
  }

  private func selectedWorkplaceId(_ configuration: ConfigureWidgetWorkplaceIntent) -> String? {
    configuration.workplace.id == WidgetWorkplaceEntity.activeWorkplaceId ? nil : configuration.workplace.id
  }

  private func makeEntry(workplaceId: String?) -> JournalLauncherEntry {
    let defaults = UserDefaults(suiteName: appGroupId)
    let snapshot = SafeToSpendSnapshot.load(workplaceId: workplaceId)
    return JournalLauncherEntry(
      date: Date(),
      safeToSpend: snapshot,
      workplaceId: snapshot?.workplaceId ?? SafeToSpendSnapshot.resolveWorkplaceId(workplaceId: workplaceId),
      theme: WidgetThemeSnapshot.load() ?? .fallback,
      isPrivacyEnabled: defaults?.bool(forKey: "widget_is_privacy_enabled") ?? false
    )
  }
}

struct JournalLauncherWidgetView: View {
  @Environment(\.widgetFamily) private var family
  var entry: JournalLauncherProvider.Entry

  var body: some View {
    widgetContent
      .widgetURL(widgetLaunchURL(homeLaunchURL, workplaceId: entry.workplaceId))
  }

  @ViewBuilder
  private var widgetContent: some View {
    let theme = entry.theme
    let content = Group {
      switch family {
      case .systemSmall:
        smallLayout
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

  private var smallLayout: some View {
    VStack(alignment: .leading, spacing: 7) {
      if let workplaceName {
        Text("For \(workplaceName)")
          .font(.system(size: 10, weight: .semibold, design: .rounded))
          .foregroundStyle(entry.theme.secondaryTextColor)
          .lineLimit(1)
          .minimumScaleFactor(0.75)
      }

      launcherActions(spacing: 6, iconSize: 38, titleSize: 9, containerSpacing: 8, showsHeading: false)
    }
  }

  private var workplaceName: String? {
    entry.safeToSpend?.workplaceName
      ?? SafeToSpendSnapshot.resolveWorkplaceName(workplaceId: entry.workplaceId)
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
          destination: widgetLaunchURL(incomeLaunchURL, workplaceId: entry.workplaceId),
          iconSize: iconSize,
          titleSize: titleSize
        )
        actionLink(
          title: "Expense",
          systemImage: "arrow.up.right.circle.fill",
          accent: entry.theme.expenseAccentColor,
          destination: widgetLaunchURL(expenseLaunchURL, workplaceId: entry.workplaceId),
          iconSize: iconSize,
          titleSize: titleSize
        )
        actionLink(
          title: "Transfer",
          systemImage: "arrow.left.arrow.right.circle.fill",
          accent: entry.theme.transferAccentColor,
          destination: widgetLaunchURL(transferLaunchURL, workplaceId: entry.workplaceId),
          iconSize: iconSize,
          titleSize: titleSize
        )
      }
    }
  }

  private func safeToSpendPanel(amountFontSize: CGFloat, titleSize: CGFloat, subtitleSize: CGFloat) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      let titleParts = [workplaceName, entry.safeToSpend?.title]
        .compactMap { value in value?.isEmpty == false ? value : nil }
      Text(titleParts.isEmpty ? "SAFE TO SPEND" : titleParts.joined(separator: " · ").uppercased())
        .font(.system(size: titleSize, weight: .bold, design: .rounded))
        .foregroundStyle(entry.theme.titleColor)
        .lineLimit(1)
        .minimumScaleFactor(0.75)

      let displayAmount = entry.isPrivacyEnabled ? "****" : (entry.safeToSpend?.formattedAmount ?? "--")
      Text(displayAmount)
        .font(.system(size: amountFontSize, weight: .bold, design: .rounded))
        .foregroundStyle(entry.theme.primaryTextColor)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
        .privacySensitive()

      Text(entry.safeToSpend?.subtitle ?? "Open the app to load data")
        .font(.system(size: subtitleSize, weight: .medium, design: .rounded))
        .foregroundStyle(entry.theme.secondaryTextColor)
        .lineLimit(2)
        .minimumScaleFactor(0.8)

      if let updatedAt = entry.safeToSpend?.updatedAt {
        let isStale = Date().timeIntervalSince(updatedAt) > 24 * 60 * 60
        Text("\(isStale ? "Data may be stale · " : "Updated ")\(updatedAt, style: .relative)")
          .font(.system(size: max(8, subtitleSize - 2), weight: .medium, design: .rounded))
          .foregroundStyle(isStale ? .orange : entry.theme.secondaryTextColor)
          .lineLimit(1)
          .minimumScaleFactor(0.75)
      }
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
          .privacySensitive()
      }
    }
  }

  @ViewBuilder
  private var accessoryRectangularView: some View {
    VStack(alignment: .leading, spacing: 2) {
      let titleParts = [workplaceName, entry.safeToSpend?.title]
        .compactMap { value in value?.isEmpty == false ? value : nil }
      Text(titleParts.isEmpty ? "SAFE TO SPEND" : titleParts.joined(separator: " · ").uppercased())
        .font(.system(size: 10, weight: .bold, design: .rounded))
        .foregroundStyle(entry.theme.titleColor)
      
      let displayAmount = entry.isPrivacyEnabled ? "****" : (entry.safeToSpend?.formattedAmount ?? "--")
      Text(displayAmount)
        .font(.system(size: 16, weight: .bold, design: .rounded))
        .privacySensitive()
      
      if let updatedAt = entry.safeToSpend?.updatedAt {
        let isStale = Date().timeIntervalSince(updatedAt) > 24 * 60 * 60
        Text("\(isStale ? "Data may be stale · " : "Updated ")\(updatedAt, style: .relative)")
          .font(.system(size: 8, weight: .medium, design: .rounded))
          .foregroundStyle(isStale ? .orange : .primary)
          .opacity(0.8)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      } else {
        Text(entry.safeToSpend?.subtitle ?? "")
          .font(.system(size: 9, weight: .medium, design: .rounded))
          .lineLimit(1)
          .opacity(0.8)
      }
    }
  }

  @ViewBuilder
  private var accessoryInlineView: some View {
    let displayAmount = entry.isPrivacyEnabled ? "****" : (entry.safeToSpend?.formattedAmount ?? "--")
    Text("\(entry.safeToSpend?.title ?? "Balance"): \(displayAmount)")
      .privacySensitive()
  }
}

private struct StaticJournalLauncherWidget: Widget {
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

@available(iOSApplicationExtension 17.0, *)
private struct ConfigurableJournalLauncherWidget: Widget {
  let kind: String = "FullFrillsBalanceJournalLauncher"

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: kind, intent: ConfigureWidgetWorkplaceIntent.self, provider: ConfigurableJournalLauncherProvider()) { entry in
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

@main
struct FullFrillsBalanceWidget {
  @MainActor
  static func main() {
    if #available(iOSApplicationExtension 17.0, *) {
      ConfigurableJournalLauncherWidget.main()
    } else {
      StaticJournalLauncherWidget.main()
    }
  }
}

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
