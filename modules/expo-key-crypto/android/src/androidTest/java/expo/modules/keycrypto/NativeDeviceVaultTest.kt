package expo.modules.keycrypto

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.security.KeyStore

/** Disposable instrumentation application. Uses real AndroidKeyStore, never production data. */
@RunWith(AndroidJUnit4::class)
class NativeDeviceVaultTest {
  private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
  private val name = "device_private_key_v1_" + "01".repeat(32)
  private val other = "device_private_key_v1_" + "02".repeat(32)
  private val preferences get() = context.getSharedPreferences("FFBKeyCrypto", Context.MODE_PRIVATE)
  private val alias = "full-frills-key-crypto.device-wrap.v1"
  private val key = ByteArray(32) { it.toByte() }
  private val vault get() = NativeDeviceVault(context)
  private fun keystore() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
  @Before @After fun cleanup() {
    preferences.edit().clear().commit()
    context.getSharedPreferences("UnrelatedFeature", Context.MODE_PRIVATE).edit().clear().commit()
    keystore().deleteEntry(alias)
  }
  private fun rejected(block: () -> Unit) {
    try { block() } catch (_: Exception) { return }
    fail("Expected vault rejection")
  }
  @Test fun ownsPreferencesAndKeystoreWithoutTouchingOtherPreferences() {
    val unrelated = context.getSharedPreferences("UnrelatedFeature", Context.MODE_PRIVATE)
    unrelated.edit().putString("unrelated", "keep").commit()
    vault.save(name, key)
    assertTrue(preferences.contains(name))
    assertTrue(keystore().containsAlias(alias))
    assertNull(keystore().getKey(alias, null).encoded)
    assertEquals("keep", unrelated.getString("unrelated", null))
    assertFalse(unrelated.contains(name))
    assertArrayEquals(key, NativeDeviceVault(context).load(name))
  }
  @Test fun rejectsReplacingAnEstablishedDeviceKey() {
    vault.save(name, key)
    vault.save(name, key)
    rejected { vault.save(name, ByteArray(32) { 42 }) }
    assertArrayEquals(key, vault.load(name))
  }
  @Test fun bindsCiphertextToItsUserDeviceScopedEntry() {
    vault.save(name, key)
    preferences.edit().putString(other, preferences.getString(name, null)).commit()
    rejected { vault.load(other) }
    assertArrayEquals(key, vault.load(name))
  }
  @Test fun missingWrappingKeyNeverCreatesAnotherKeyOrOverwritesCiphertext() {
    vault.save(name, key)
    val saved = preferences.getString(name, null)
    keystore().deleteEntry(alias)
    try { vault.load(name); fail("Expected recovery-required state") }
    catch (failure: IllegalStateException) { assertEquals("FFB_KEY_RECOVERY_REQUIRED", failure.message) }
    rejected { vault.save(name, key) }
    assertFalse(keystore().containsAlias(alias))
    assertEquals(saved, preferences.getString(name, null))
  }
  @Test fun rejectsMalformedRecordsWithoutModifyingThem() {
    vault.save(name, key)
    val saved = preferences.getString(name, null)
    for (record in listOf("{}", JSONObject(saved!!).put("version", 2).toString(), JSONObject(saved).put("nonce", "AA==").toString())) {
      preferences.edit().putString(name, record).commit()
      rejected { vault.load(name) }
      assertEquals(record, preferences.getString(name, null))
    }
  }
  @Test fun removalOnlyDeletesTheSelectedNativeDeviceEntry() {
    vault.save(name, key)
    vault.save(other, key)
    val secure = context.getSharedPreferences("UnrelatedFeature", Context.MODE_PRIVATE)
    secure.edit().putString(name, "unrelated UnrelatedFeature entry").commit()
    vault.remove(name)
    assertNull(vault.load(name))
    assertArrayEquals(key, vault.load(other))
    assertEquals("unrelated UnrelatedFeature entry", secure.getString(name, null))
  }
}
