package expo.modules.smsinbox

import android.content.Context
import android.provider.Telephony
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.Exceptions

class ExpoSmsInboxModule : Module() {
  private fun getInboxMessages(afterId: String?, limit: Int, beforeDate: Long? = null, beforeId: String? = null): List<Map<String, Any>> {
    val context: Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val boundedLimit = limit.coerceIn(1, 500)
    val selection = when {
      afterId != null -> "${Telephony.Sms._ID} > ?"
      beforeDate != null && beforeId != null -> "(${Telephony.Sms.DATE} < ? OR (${Telephony.Sms.DATE} = ? AND ${Telephony.Sms._ID} < ?))"
      else -> null
    }
    val selectionArgs = when {
      afterId != null -> arrayOf(afterId)
      beforeDate != null && beforeId != null -> arrayOf(beforeDate.toString(), beforeDate.toString(), beforeId)
      else -> null
    }
    val sortOrder = if (afterId == null) {
      "${Telephony.Sms.DATE} DESC, ${Telephony.Sms._ID} DESC LIMIT $boundedLimit"
    } else {
      "${Telephony.Sms._ID} ASC LIMIT $boundedLimit"
    }
    val projection = arrayOf(
      Telephony.Sms._ID,
      Telephony.Sms.ADDRESS,
      Telephony.Sms.BODY,
      Telephony.Sms.DATE
    )
    val messages = mutableListOf<Map<String, Any>>()
    context.contentResolver.query(
      Telephony.Sms.Inbox.CONTENT_URI,
      projection,
      selection,
      selectionArgs,
      sortOrder
    )?.use { cursor ->
      val idIndex = cursor.getColumnIndexOrThrow(Telephony.Sms._ID)
      val addressIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
      val bodyIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
      val dateIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
      while (cursor.moveToNext()) {
        messages.add(
          mapOf(
            "id" to cursor.getString(idIndex),
            "address" to cursor.getString(addressIndex).orEmpty(),
            "body" to cursor.getString(bodyIndex).orEmpty(),
            "date" to cursor.getLong(dateIndex)
          )
        )
      }
    }
    return messages
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoSmsInbox")

    AsyncFunction("getSmsInbox") { limit: Int ->
      return@AsyncFunction getInboxMessages(null, limit)
    }

    AsyncFunction("getSmsInboxAfterId") { afterId: String, limit: Int ->
      return@AsyncFunction getInboxMessages(afterId, limit)
    }

    AsyncFunction("getSmsInboxBefore") { beforeDate: Double, beforeId: String, limit: Int ->
      return@AsyncFunction getInboxMessages(null, limit, beforeDate.toLong(), beforeId)
    }

    AsyncFunction("getLatestSmsId") {
      val context: Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val cursor = context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf(Telephony.Sms._ID),
        null,
        null,
        "${Telephony.Sms._ID} DESC LIMIT 1"
      )
      return@AsyncFunction cursor?.use {
        if (it.moveToFirst()) it.getString(0) else null
      }
    }

    AsyncFunction("setAutomaticImportEnabled") { enabled: Boolean ->
      val context: Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val saved = context.getSharedPreferences("sms_auto_import", Context.MODE_PRIVATE)
        .edit()
        .putBoolean("enabled", enabled)
        .commit()
      if (!saved) throw IllegalStateException("Could not save automatic SMS import setting")
    }
  }
}
