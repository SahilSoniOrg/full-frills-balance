import ExpoModulesCore

public final class ExpoKeyCryptoModule: Module {
  private let recoveryFiles = RecoveryFilePicker()
  public func definition() -> ModuleDefinition {
    Name("ExpoKeyCrypto")
    Function("setAllowed") { (allowed: Bool) in
      FFBKeyCrypto.setAllowed(allowed)
      DispatchQueue.main.async { self.recoveryFiles.setAllowed(allowed) }
    }
    AsyncFunction("execute") { (operation: String, request: String) in
      try FFBKeyCrypto.executeOperation(operation, request: request)
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
