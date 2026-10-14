package expo.modules.keycrypto

import androidx.annotation.Keep
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import org.json.JSONObject

@Keep
class ExpoKeyCryptoModule : Module() {
  companion object {
    init { System.loadLibrary("FFBKeyCrypto") }
    private const val PICK_RECOVERY = 49381
  }
  private external fun executeNative(operation: String, request: String, vault: NativeDeviceVault): String
  private external fun setAllowedNative(allowed: Boolean)
  private external fun importCredentialNative(bytes: ByteArray): String
  private external fun credentialFileNative(handle: String): ByteArray
  private external fun retainCredentialNative(handle: String)
  private external fun releaseCredentialNative(handle: String)
  private external fun clearCredentialsNative()
  private val context get() = requireNotNull(appContext.reactContext)
  private var pending: Promise? = null
  private var exporting: String? = null
  private var selected: Uri? = null
  @Volatile private var allowed = false
  private var foreground = false
  private fun finishImport() {
    val uri = selected ?: return
    if (!allowed || !foreground) return
    val promise = pending
    try {
      val result = readCredential(uri)
      cleanup()
      promise?.resolve(result)
    } catch (failure: Exception) { finishFailure(failure) }
  }

  private fun readCredential(uri: Uri): String {
    val buffer = ByteArray(4097)
    try {
      val length = requireNotNull(context.contentResolver.openInputStream(uri)).use { input ->
        var count = 0
        while (count < buffer.size) {
          val read = input.read(buffer, count, buffer.size - count)
          if (read < 0) break
          count += read
        }
        count
      }
      require(length <= 4096) { "FFB_KEY_INVALID_FILE" }
      val bytes = buffer.copyOf(length)
      try { return importCredentialNative(bytes) } finally { bytes.fill(0) }
    } finally { buffer.fill(0) }
  }
  private fun writeCredential(handle: String, uri: Uri) {
    val bytes = credentialFileNative(handle)
    try {
      requireNotNull(context.contentResolver.openOutputStream(uri, "wt")).use { it.write(bytes) }
    } finally { bytes.fill(0) }
  }
  private fun document(uri: Uri): Uri {
    require(uri.scheme == "content" && DocumentsContract.isDocumentUri(context, uri)) { "FFB_KEY_INVALID_FILE" }
    return uri
  }
  private fun fixture(uri: String): Uri {
    check(BuildConfig.RECOVERY_PROOF) { "FFB_KEY_OPERATION_FAILED" }
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "FFB_KEY_INVALID_FILE" }
    val file = File(requireNotNull(parsed.path)).canonicalFile
    require(file.parentFile == context.filesDir.canonicalFile && file.name in listOf("native-recovery-user-secret.json", "native-recovery-workplace-secret.json")) { "FFB_KEY_INVALID_FILE" }
    return parsed
  }
  private fun startPicker(handle: String?, promise: Promise) {
    check(pending == null) { "FFB_KEY_OPERATION_FAILED" }
    val activity = requireNotNull(appContext.currentActivity)
    if (handle != null) retainCredentialNative(handle)
    pending = promise
    exporting = handle
    try {
      val intent = Intent(if (handle == null) Intent.ACTION_OPEN_DOCUMENT else Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "application/json"
        if (handle == null) putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/plain", "application/octet-stream"))
        else putExtra(Intent.EXTRA_TITLE, "full-frills-${JSONObject(handle).getString("purpose")}-secret.json")
      }
      activity.startActivityForResult(intent, PICK_RECOVERY)
    } catch (failure: Exception) { finishFailure(failure) }
  }
  private fun cleanup() {
    exporting?.let { releaseCredentialNative(it) }
    exporting = null
    selected = null
    pending = null
  }
  private fun finishFailure(failure: Exception) {
    val promise = pending
    try { cleanup() } finally {
      val code = Regex("FFB_KEY_[A-Z_]+").find(failure.message ?: "")?.value ?: "FFB_KEY_OPERATION_FAILED"
      promise?.reject(code, code, null)
    }
  }
  override fun definition() = ModuleDefinition {
    Name("ExpoKeyCrypto")
    Function("setAllowed") { value: Boolean ->
      allowed = value
      setAllowedNative(value)
      if (value) Handler(Looper.getMainLooper()).post { finishImport() }
    }
    OnActivityEntersForeground { foreground = true; finishImport() }
    OnActivityEntersBackground { foreground = false }
    AsyncFunction("execute") { operation: String, request: String -> executeNative(operation, request, NativeDeviceVault(context)) }
    AsyncFunction("pickCredential") { promise: Promise -> startPicker(null, promise) }.runOnQueue(Queues.MAIN)
    AsyncFunction("exportCredential") { handle: String, promise: Promise -> startPicker(handle, promise) }.runOnQueue(Queues.MAIN)
    OnActivityResult { _, (requestCode, resultCode, intent) ->
      if (requestCode == PICK_RECOVERY && pending != null) {
        val promise = pending
        val handle = exporting
        try {
          val result: Any? = if (resultCode != Activity.RESULT_OK) {
            if (handle == null) null else false
          } else {
            val uri = document(requireNotNull(intent?.data))
            if (handle == null) {
              selected = uri
              finishImport()
              return@OnActivityResult
            } else { writeCredential(handle, uri); true }
          }
          cleanup()
          promise?.resolve(result)
        } catch (failure: Exception) { finishFailure(failure) }
      }
    }
    if (BuildConfig.RECOVERY_PROOF) {
      AsyncFunction("importCredential") { uri: String -> readCredential(fixture(uri)) }
      AsyncFunction("writeCredential") { handle: String, uri: String -> writeCredential(handle, fixture(uri)) }
    }
    AsyncFunction("retainCredential") { handle: String -> retainCredentialNative(handle) }
    AsyncFunction("releaseCredential") { handle: String -> releaseCredentialNative(handle) }
    AsyncFunction("clearCredentials") { clearCredentialsNative() }
    OnDestroy {
      setAllowedNative(false)
      clearCredentialsNative()
      finishFailure(IllegalStateException("FFB_KEY_CANCELLED"))
    }
  }
}
