package expo.modules.keycrypto

import androidx.annotation.Keep

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

@Keep
class ExpoKeyCryptoModule : Module() {
  companion object { init { System.loadLibrary("FFBKeyCrypto") } }
  private external fun executeNative(operation: String, request: String, vault: NativeDeviceVault): String
  private external fun setAllowedNative(allowed: Boolean)
  private external fun importCredentialNative(bytes: ByteArray): String
  private external fun credentialFileNative(handle: String): ByteArray
  private external fun retainCredentialNative(handle: String)
  private external fun releaseCredentialNative(handle: String)
  private external fun clearCredentialsNative()
  private val context get() = requireNotNull(appContext.reactContext)
  override fun definition() = ModuleDefinition {
    Name("ExpoKeyCrypto")
    Function("setAllowed") { allowed: Boolean -> setAllowedNative(allowed) }
    AsyncFunction("execute") { operation: String, request: String ->
      executeNative(operation, request, NativeDeviceVault(context))
    }
    AsyncFunction("importCredential") { uri: String ->
      val opened = requireNotNull(context.contentResolver.openInputStream(Uri.parse(uri)))
      val buffer = ByteArray(4097)
      val bytes = try {
        val length = opened.use { input ->
          var count = 0
          while (count < buffer.size) {
            val read = input.read(buffer, count, buffer.size - count)
            if (read < 0) break
            count += read
          }
          count
        }
        require(length <= 4096) { "Recovery file is too large" }
        buffer.copyOf(length)
      } finally { buffer.fill(0) }
      require(bytes.size <= 4096) { "Recovery file is too large" }
      try { importCredentialNative(bytes) } finally { bytes.fill(0) }
    }
    AsyncFunction("retainCredential") { handle: String -> retainCredentialNative(handle) }
    AsyncFunction("releaseCredential") { handle: String -> releaseCredentialNative(handle) }
    AsyncFunction("writeCredential") { handle: String, uri: String ->
      val bytes = credentialFileNative(handle)
      try {
        requireNotNull(context.contentResolver.openOutputStream(Uri.parse(uri), "wt")).use { it.write(bytes) }
      } finally { bytes.fill(0) }
    }
    AsyncFunction("clearCredentials") { clearCredentialsNative() }
    OnDestroy { setAllowedNative(false); clearCredentialsNative() }
  }
}
