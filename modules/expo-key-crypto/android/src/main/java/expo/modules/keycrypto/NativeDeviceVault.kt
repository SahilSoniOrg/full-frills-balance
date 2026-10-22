package expo.modules.keycrypto

import android.content.Context
import android.app.KeyguardManager
import android.os.Build
import android.security.keystore.KeyPermanentlyInvalidatedException
import javax.crypto.AEADBadTagException
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.annotation.Keep
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Owns its Keystore wrapping key and encrypted preferences. */
@Keep
class NativeDeviceVault(private val context: Context) {
  private val preferences get() = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
  private fun validate(name: String) {
    require(name.matches(Regex("device_private_key_v1_[a-f0-9]{64}")))
  }
  private fun secret(create: Boolean, recovering: Boolean = false): SecretKey? {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    if (!create) return null
    check(recovering || preferences.all.isEmpty()) { "FFB_KEY_RECOVERY_REQUIRED" }
    return KeyGenerator.getInstance("AES", "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setUserAuthenticationRequired(false).apply {
          // Android 12–14 have documented key-deletion bugs with this flag.
          if (Build.VERSION.SDK_INT >= 35) setUnlockedDeviceRequired(true)
        }.build())
    }.generateKey()
  }
  private fun opened(name: String, encoded: String): ByteArray {
    val record = JSONObject(encoded)
    require(record.length() == 4 && record.getInt("version") == 1 && record.getString("algorithm") == "AES-256-GCM")
    val key = secret(false) ?: error("Device wrapping key is unavailable; User recovery is required")
    val nonce = Base64.decode(record.getString("nonce"), Base64.NO_WRAP)
    val ciphertext = Base64.decode(record.getString("ciphertext"), Base64.NO_WRAP)
    require(nonce.size == 12 && ciphertext.size == 48)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, nonce))
    cipher.updateAAD(binding(name))
    val value = cipher.doFinal(ciphertext)
    if (value.size != 32) { value.fill(0); error("Invalid native Device key") }
    return value
  }
  private fun requireUnlocked() {
    check(!context.getSystemService(KeyguardManager::class.java).isDeviceLocked) { "FFB_KEY_VAULT_UNAVAILABLE" }
  }
  fun load(name: String): ByteArray? {
    validate(name)
    requireUnlocked()
    val encoded = preferences.getString(name, null) ?: return null
    try { return opened(name, encoded) }
    catch (failure: Exception) {
      val permanent = failure is AEADBadTagException || failure is KeyPermanentlyInvalidatedException || failure is org.json.JSONException || failure is IllegalArgumentException || failure.message?.contains("wrapping key is unavailable") == true
      throw IllegalStateException(if (permanent) "FFB_KEY_RECOVERY_REQUIRED" else "FFB_KEY_VAULT_UNAVAILABLE")
    }
  }
  fun save(name: String, key: ByteArray) = persist(name, key, false)
  /** Only the authenticated native recovery operation calls this; old ciphertext is retained. */
  fun saveRecovered(name: String, key: ByteArray) = persist(name, key, true)
  private fun persist(name: String, key: ByteArray, recovering: Boolean) {
    validate(name)
    require(key.size == 32)
    load(name)?.let { existing ->
      try { require(existing.contentEquals(key)) { "Device key replacement is forbidden" } }
      finally { existing.fill(0) }
      return
    }
    write(name, key, recovering)
    val checked = load(name) ?: error("Device key readback failed")
    try { check(checked.contentEquals(key)) } finally { checked.fill(0) }
  }
  private fun write(name: String, key: ByteArray, recovering: Boolean) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, secret(true, recovering))
    cipher.updateAAD(binding(name))
    val record = JSONObject().put("version", 1).put("algorithm", "AES-256-GCM")
      .put("nonce", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
      .put("ciphertext", Base64.encodeToString(cipher.doFinal(key), Base64.NO_WRAP))
    check(preferences.edit().putString(name, record.toString()).commit()) { "Device key persistence failed" }
  }
  fun remove(name: String) {
    validate(name)
    check(preferences.edit().remove(name).commit())
  }
  fun clear() {
    check(preferences.edit().clear().commit())
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (store.containsAlias(ALIAS)) store.deleteEntry(ALIAS)
  }
  private fun binding(name: String) = "full-frills-device-vault:1:$name".toByteArray(Charsets.UTF_8)
  companion object {
    const val PREFERENCES = "FFBKeyCrypto"
    const val ALIAS = "full-frills-key-crypto.device-wrap.v1"
  }
}
