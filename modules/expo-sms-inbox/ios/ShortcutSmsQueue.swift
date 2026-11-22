import CryptoKit
import Foundation

public struct ShortcutSmsRecord: Codable {
  public let id: String
  public let address: String
  public let body: String
  public let date: Double

  public init(id: String, address: String, body: String, date: Double) {
    self.id = id
    self.address = address
    self.body = body
    self.date = date
  }
}

/// Durable, per-alert files avoid cross-process read/modify/write races between
/// Shortcuts and the app. Files remain available after the first device unlock.
public enum ShortcutSmsQueue {
  private static let directoryName = "ShortcutSmsInbox"
  private static let firstReceivedName = "first-received"
  private static let generationPrefix = "generation-"
  private static let protectedWrite: Data.WritingOptions = [
    .atomic, .completeFileProtectionUntilFirstUserAuthentication,
  ]

  private static var root: URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent(directoryName, isDirectory: true)
  }

  private static var generationFile: URL { root.appendingPathComponent("generation") }

  private static func activeDirectory() throws -> URL {
    do {
      let generation = try String(contentsOf: generationFile, encoding: .utf8)
      guard UUID(uuidString: generation) != nil else { throw QueueError.invalidGeneration }
      return root.appendingPathComponent(generationPrefix + generation, isDirectory: true)
    } catch where isMissing(error) {
      // Preserve pending deliveries from installs that predate queue generations.
      return root
    }
  }

  private static func isMissing(_ error: Error) -> Bool {
    let code = (error as? CocoaError)?.code
    return code == .fileNoSuchFile || code == .fileReadNoSuchFile
  }

  private static func prepareDirectory(_ directory: URL) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    var mutableDirectory = directory
    try mutableDirectory.setResourceValues(values)
    try FileManager.default.setAttributes(
      [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
      ofItemAtPath: directory.path
    )
  }

  @discardableResult
  public static func enqueue(body: String, sender: String?, receivedAt: Date?) throws -> String {
    guard !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw QueueError.emptyMessage
    }
    let directory = try activeDirectory()
    try prepareDirectory(root)
    if directory != root { try prepareDirectory(directory) }
    let date = receivedAt ?? Date()
    let address = sender ?? ""
    let id: String
    if let receivedAt {
      let identity = "\(address)|\(receivedAt.timeIntervalSince1970)|\(body)"
      id = SHA256.hash(data: Data(identity.utf8)).map { String(format: "%02x", $0) }.joined()
    } else {
      // No upstream event ID exists when Shortcuts omits the source date.
      // Keep this invocation durable without coalescing later identical alerts.
      id = UUID().uuidString.lowercased()
    }
    let record = ShortcutSmsRecord(id: id, address: address, body: body, date: date.timeIntervalSince1970 * 1000)
    let destination = directory.appendingPathComponent("\(id).json")
    if !FileManager.default.fileExists(atPath: destination.path) {
      let data = try JSONEncoder().encode(record)
      try data.write(to: destination, options: protectedWrite)
    }
    createFirstReceivedMarkerIfNeeded(at: date, in: directory)
    return id
  }

  public static func pending() throws -> [ShortcutSmsRecord] {
    let directory = try activeDirectory()
    let entries: [URL]
    do {
      entries = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
    } catch where isMissing(error) {
      return []
    }
    return entries
      .filter { $0.pathExtension == "json" }
      .compactMap { url in try? JSONDecoder().decode(ShortcutSmsRecord.self, from: Data(contentsOf: url)) }
      .sorted { $0.date < $1.date }
  }

  public static func acknowledge(id: String) throws {
    guard !id.contains("/") else { throw QueueError.invalidID }
    try removeIfPresent(activeDirectory().appendingPathComponent("\(id).json"))
  }

  public static func firstReceivedAt() throws -> Double? {
    let marker = try activeDirectory().appendingPathComponent(firstReceivedName)
    guard let value = try? String(contentsOf: marker, encoding: .utf8), let date = Double(value) else { return nil }
    return date * 1000
  }

  public static func invalidate() throws {
    try prepareDirectory(root)
    // Publish the new generation before the database reset. Intents that already
    // resolved their directory can only write to the retired generation.
    try Data(UUID().uuidString.utf8).write(to: generationFile, options: protectedWrite)
  }

  public static func purgeRetired() throws {
    let entries: [URL]
    do {
      entries = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
    } catch where isMissing(error) {
      return
    }
    // Enumerate before reading the marker so a concurrent rotation's new
    // directory cannot be mistaken for a retired directory in this snapshot.
    let active = try activeDirectory()
    guard active != root else { return }
    var firstError: Error?
    for entry in entries where entry.lastPathComponent != active.lastPathComponent {
      let name = entry.lastPathComponent
      guard name.hasPrefix(generationPrefix) || name == firstReceivedName || entry.pathExtension == "json" else {
        continue
      }
      do { try removeIfPresent(entry) }
      catch { firstError = firstError ?? error }
    }
    if let firstError { throw firstError }
  }

  private static func removeIfPresent(_ path: URL) throws {
    do { try FileManager.default.removeItem(at: path) }
    catch where isMissing(error) {}
  }

  private static func createFirstReceivedMarkerIfNeeded(at date: Date, in directory: URL) {
    let marker = directory.appendingPathComponent(firstReceivedName)
    let descriptor = open(marker.path, O_WRONLY | O_CREAT | O_EXCL, S_IRUSR | S_IWUSR)
    guard descriptor >= 0 else { return }
    let value = String(date.timeIntervalSince1970)
    _ = value.withCString { write(descriptor, $0, strlen($0)) }
    close(descriptor)
    try? FileManager.default.setAttributes(
      [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
      ofItemAtPath: marker.path
    )
  }

  public enum QueueError: Error { case emptyMessage, invalidID, invalidGeneration }
}
