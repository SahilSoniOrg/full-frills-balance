import ExpoModulesCore

public final class ExpoKeyCryptoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoKeyCrypto")
    Function("setAllowed") { (allowed: Bool) in FFBKeyCrypto.setAllowed(allowed) }
    AsyncFunction("execute") { (operation: String, request: String) in
      try FFBKeyCrypto.executeOperation(operation, request: request)
    }
    AsyncFunction("importCredential") { (uri: String) in try FFBKeyCrypto.importCredential(uri) }
    AsyncFunction("writeCredential") { (handle: String, uri: String) in
      try FFBKeyCrypto.writeCredential(handle, uri: uri)
    }
    AsyncFunction("retainCredential") { (handle: String) in try FFBKeyCrypto.retainCredential(handle) }
    AsyncFunction("releaseCredential") { (handle: String) in try FFBKeyCrypto.releaseCredential(handle) }
    AsyncFunction("clearCredentials") { FFBKeyCrypto.clearCredentials() }
    OnDestroy { FFBKeyCrypto.setAllowed(false); FFBKeyCrypto.clearCredentials() }
  }
}
