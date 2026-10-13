package expo.modules.keycrypto

import androidx.annotation.Keep

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Reads the old SecureStore entry natively and retains the same Device key. */
@Keep
class NativeDeviceVault(private val context: Context) {
  private val preferences get() = context.getSharedPreferences("SecureStore", Context.MODE_PRIVATE)
  private val alias = "AES/GCM/NoPadding:key_v1:keystoreUnauthenticated"
  private val keystore get() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
  private fun storageKey(name: String) = "key_v1-$name"
  private fun secret(create: Boolean): SecretKey? {
    val store = keystore
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    if (!create) return null
    return KeyGenerator.getInstance("AES", "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setUserAuthenticationRequired(false).build())
    }.generateKey()
  }
  fun load(name: String): ByteArray? {
    require(name.matches(Regex("device_private_key_v1_[a-f0-9]{64}")))
    val stored = preferences.getString(storageKey(name), null) ?: preferences.getString(name, null) ?: return null
    val record = JSONObject(stored)
    val scheme = record.getString("scheme")
    require(!record.optBoolean("requireAuthentication") && record.getInt("tlen") == 128)
    require(scheme == "aes" || scheme == "ffb-native-device-v1")
    val key = secret(false) ?: return null
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, Base64.decode(record.getString("iv"), Base64.NO_WRAP)))
    val opened = cipher.doFinal(Base64.decode(record.getString("ct"), Base64.NO_WRAP))
    if (scheme == "ffb-native-device-v1") {
      if (opened.size != 32) { opened.fill(0); error("Invalid native Device key") }
      return opened
    }
    val value = ByteArray(32)
    try {
      require(opened.size == 64)
      for (index in value.indices) {
        val high = Character.digit(opened[index * 2].toInt().toChar(), 16)
        val low = Character.digit(opened[index * 2 + 1].toInt().toChar(), 16)
        require(high >= 0 && low >= 0)
        value[index] = ((high shl 4) or low).toByte()
      }
      // SecureStore's generic JS getter refuses our native-only encoding scheme.
      write(name, value)
      return value
    } catch (failure: Throwable) { value.fill(0); throw failure }
    finally { opened.fill(0) }
  }
  fun save(name: String, key: ByteArray) {
    require(key.size == 32)
    val existing = load(name)
    if (existing != null) {
      try { require(existing.contentEquals(key)) { "Device key replacement is forbidden" } }
      finally { existing.fill(0) }
      return
    }
    write(name, key)
    val check = load(name) ?: error("Device key readback failed")
    try { require(check.contentEquals(key)) { "Device key readback failed" } } finally { check.fill(0) }
  }
  private fun write(name: String, key: ByteArray) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, secret(true))
    val record = JSONObject().put("scheme", "ffb-native-device-v1")
      .put("ct", Base64.encodeToString(cipher.doFinal(key), Base64.NO_WRAP))
      .put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).put("tlen", 128)
      .put("usesKeystoreSuffix", true).put("keystoreAlias", "key_v1").put("requireAuthentication", false)
    check(preferences.edit().putString(storageKey(name), record.toString()).remove(name).commit())
  }
  fun remove(name: String) { check(preferences.edit().remove(storageKey(name)).remove(name).commit()) }
}
