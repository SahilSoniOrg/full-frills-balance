import Foundation

struct PendingSmsKeys {
  static let prefix = "pending_sms_"
  static let records = "pending_sms_records"
  static let quickApprove = "pending_sms_quick_approve"

  static func merchant(for id: String) -> String { "\(prefix)\(id)_merchant" }
  static func amount(for id: String) -> String { "\(prefix)\(id)_amount" }
  static func currency(for id: String) -> String { "\(prefix)\(id)_currency" }
  static func sender(for id: String) -> String { "\(prefix)\(id)_sender" }
  static func date(for id: String) -> String { "\(prefix)\(id)_date" }
}
