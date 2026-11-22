import ExpoModulesCore
import Foundation

public final class ExpoShortcutSmsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoShortcutSms")

    AsyncFunction("getPending") { () throws -> [[String: Any]] in
      try ShortcutSmsQueue.pending().map { record in
        ["id": record.id, "address": record.address, "body": record.body, "date": record.date]
      }
    }

    AsyncFunction("acknowledge") { (id: String) throws in
      try ShortcutSmsQueue.acknowledge(id: id)
    }

    AsyncFunction("getStatus") { () throws -> [String: Any] in
      ["firstReceivedAt": try ShortcutSmsQueue.firstReceivedAt() as Any? ?? NSNull()]
    }

    AsyncFunction("invalidate") { () throws in
      try ShortcutSmsQueue.invalidate()
    }

    AsyncFunction("purgeRetired") { () throws in
      try ShortcutSmsQueue.purgeRetired()
    }
  }
}
