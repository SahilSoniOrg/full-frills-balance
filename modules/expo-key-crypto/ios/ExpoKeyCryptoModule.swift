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
    // Disposable fixture paths are unavailable in ordinary production builds.
    #if FFB_KEY_CRYPTO_E2E
      AsyncFunction("importCredential") { (uri: String) in
        try self.validateFixture(uri)
        return try FFBKeyCrypto.importCredential(uri)
      }
      AsyncFunction("writeCredential") { (handle: String, uri: String) in
        try self.validateFixture(uri)
        try FFBKeyCrypto.writeCredential(handle, uri: uri)
      }
    #endif
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
  #if FFB_KEY_CRYPTO_E2E
    private func validateFixture(_ uri: String) throws {
      let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        .standardizedFileURL
      guard let url = URL(string: uri), url.isFileURL,
        url.deletingLastPathComponent().standardizedFileURL == root,
        ["native-recovery-user-secret.json", "native-recovery-workplace-secret.json"].contains(
          url.lastPathComponent)
      else { throw NSError(domain: "FFB_KEY_INVALID_FILE", code: 1) }
    }
  #endif
}
