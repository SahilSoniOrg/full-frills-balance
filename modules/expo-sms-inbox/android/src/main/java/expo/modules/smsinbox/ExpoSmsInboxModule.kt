package expo.modules.smsinbox

import android.content.Context
import android.net.Uri
import android.provider.Telephony
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.Exceptions

class ExpoSmsInboxModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoSmsInbox")

    AsyncFunction("getSmsInbox") { limit: Int ->
      val context: Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      
      val smsList = mutableListOf<Map<String, Any>>()
      
      val contentResolver = context.contentResolver
      val uri = Telephony.Sms.Inbox.CONTENT_URI
      
      val projection = arrayOf(
        Telephony.Sms._ID,
        Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY,
        Telephony.Sms.DATE
      )
      
      val sortOrder = "${Telephony.Sms.DATE} DESC LIMIT $limit"

      val cursor = contentResolver.query(
        uri,
        projection,
        null, // selection
        null, // selectionArgs
        sortOrder
      )

      cursor?.use {
        val idIndex = it.getColumnIndexOrThrow(Telephony.Sms._ID)
        val addressIndex = it.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val bodyIndex = it.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val dateIndex = it.getColumnIndexOrThrow(Telephony.Sms.DATE)

        while (it.moveToNext()) {
          val id = it.getString(idIndex)
          val address = it.getString(addressIndex)
          val body = it.getString(bodyIndex)
          val date = it.getLong(dateIndex)

          val smsMap = mapOf(
            "id" to id,
            "address" to address,
            "body" to body,
            "date" to date
          )
          smsList.add(smsMap)
        }
      }
      
      return@AsyncFunction smsList
    }
  }
}
