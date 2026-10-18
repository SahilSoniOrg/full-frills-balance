import ExpoModulesCore

public final class ExpoKeyCryptoModule: Module {
  private let recoveryFiles = RecoveryFilePicker()
  private let nativeErrorCodes: Set<String> = [
    "FFB_KEY_LOCKED", "FFB_KEY_VAULT_UNAVAILABLE", "FFB_KEY_RECOVERY_REQUIRED",
    "FFB_KEY_INVALID_FILE", "FFB_KEY_AUTHENTICATION_FAILED",
    "FFB_KEY_REFERENCE_EXPIRED", "FFB_KEY_CANCELLED", "FFB_KEY_OPERATION_FAILED",
    "FFB_KEY_IDENTITY_MISMATCH",
    "FFB_ROW_UNSUPPORTED_COMPRESSION", "FFB_ROW_TOO_LARGE", "FFB_ROW_INTEGRITY"
  ]

  private func safeNativeError(_ error: Error) -> NSError {
    let message = (error as NSError).localizedDescription
    let code = nativeErrorCodes.first(where: { message.contains($0) }) ?? "FFB_KEY_OPERATION_FAILED"
    return NSError(domain: code, code: 1, userInfo: [NSLocalizedDescriptionKey: code])
  }

  public func definition() -> ModuleDefinition {
    Name("ExpoKeyCrypto")
    Function("setAllowed") { (allowed: Bool) in
      FFBKeyCrypto.setAllowed(allowed)
      DispatchQueue.main.async { self.recoveryFiles.setAllowed(allowed) }
    }
    AsyncFunction("execute") { (operation: String, request: String) in
      do {
        return try FFBKeyCrypto.executeOperation(operation, request: request)
      } catch {
        throw self.safeNativeError(error)
      }
    }
    AsyncFunction("pickCredential") { (promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        throw NSError(domain: "FFB_KEY_OPERATION_FAILED", code: 1)
      }
      try self.recoveryFiles.pick(from: presenter, promise: promise)
    }.runOnQueue(.main)
    AsyncFunction("exportCredential") { (handle: String, promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        throw NSError(domain: "FFB_KEY_OPERATION_FAILED", code: 1)
      }
      try self.recoveryFiles.export(handle, from: presenter, promise: promise)
    }.runOnQueue(.main)
    AsyncFunction("retainCredential") { (handle: String) in
      try FFBKeyCrypto.retainCredential(handle)
    }
    AsyncFunction("releaseCredential") { (handle: String) in
      try FFBKeyCrypto.releaseCredential(handle)
    }
    AsyncFunction("clearCredentials") { FFBKeyCrypto.clearCredentials() }
    OnDestroy {
      FFBKeyCrypto.setAllowed(false)
      FFBKeyCrypto.clearCredentials()
      DispatchQueue.main.async { self.recoveryFiles.cancel() }
    }
  }
}
