package expo.modules.smsinbox

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Telephony
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

class IncomingSmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    val preferences = context.getSharedPreferences("sms_auto_import", Context.MODE_PRIVATE)
    if (!preferences.getBoolean("enabled", false)) return
    if (context.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED ||
      context.checkSelfPermission(Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED
    ) return

    try {
      context.startService(Intent(context, AutomaticSmsImportTaskService::class.java))
      HeadlessJsTaskService.acquireWakeLockNow(context)
    } catch (error: IllegalStateException) {
      Log.w("IncomingSmsReceiver", "Could not schedule automatic SMS import", error)
    } catch (error: SecurityException) {
      Log.w("IncomingSmsReceiver", "SMS permissions changed before import could start", error)
    }
  }
}
