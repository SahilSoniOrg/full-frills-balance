import Foundation

public struct PendingSmsKeys {
  public static let prefix = "pending_sms_"
  public static let records = "pending_sms_records"
  public static let quickApprove = "pending_sms_quick_approve"

  public static func merchant(for id: String) -> String { "\(prefix)\(id)_merchant" }
  public static func amount(for id: String) -> String { "\(prefix)\(id)_amount" }
  public static func currency(for id: String) -> String { "\(prefix)\(id)_currency" }
  public static func sender(for id: String) -> String { "\(prefix)\(id)_sender" }
  public static func date(for id: String) -> String { "\(prefix)\(id)_date" }
}
