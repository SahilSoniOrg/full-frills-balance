package expo.modules.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * BroadcastReceiver that handles 1-tap SMS quick-import from Android widgets.
 *
 * ARCHITECTURE & FOREGROUND REQUIREMENT:
 * WatermelonDB, ledger write services, and domain business rules exist exclusively in
 * the React Native / JavaScript runtime. Android BroadcastReceivers triggered from widget
 * button taps run in a lightweight background process without the RN JS bridge or SQLite
 * connection initialized. Direct background DB updates without waking JS would risk state
 * corruption and bypass ledger validation logic.
 *
 * Therefore, when the user taps "Quick Import", this receiver:
 * 1. Writes the target record ID to SharedPreferences (`pending_sms_quick_approve`).
 * 2. Launches the app into the foreground via deep link `fullfrillsbalance://inbox?approve=<recordId>`.
 * 3. Upon foregrounding, the app's JS layer reads the approval parameter and invokes
 *    `smsService.processInboxRecord(recordId, 'imported')` to complete the transaction creation.
 */
class SmsQuickImportReceiver : BroadcastReceiver() {

  companion object {
    val PREFS_NAME = ExpoWidgetsModule.PREFS_NAME
    private const val KEY_PENDING_SMS_RECORDS = "pending_sms_records"

    const val EXTRA_RECORD_ID = "record_id"
    const val EXTRA_PREFIX = "pending_sms_"

    const val APP_SCHEME = "fullfrillsbalance"

    private const val REQUEST_CODE_BASE = 2000

    fun refreshWidgets(context: Context) {
      val appWidgetManager = AppWidgetManager.getInstance(context)
      val providerClassNames = ExpoWidgetsModule.WIDGET_PROVIDER_CLASS_NAMES

      providerClassNames.forEach { className ->
        runCatching {
          val providerClass = Class
            .forName("${context.packageName}.$className")
            .asSubclass(android.appwidget.AppWidgetProvider::class.java)

          val componentName = ComponentName(context, providerClass)
          val ids = appWidgetManager.getAppWidgetIds(componentName)
          if (ids.isEmpty()) return@runCatching

          val updateIntent = Intent(context, providerClass).apply {
            action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
          }
          context.sendBroadcast(updateIntent)
        }
      }
    }

    /**
     * Creates a PendingIntent that fires this BroadcastReceiver when the
     * widget button is tapped. The receiver then opens the deep link and
     * refreshes the widget.
     */
    fun createQuickImportPendingIntent(
      context: Context,
      recordId: String,
    ): PendingIntent {
      val intent = Intent(context, SmsQuickImportReceiver::class.java).apply {
        action = ACTION_SMS_QUICK_IMPORT
        putExtra(EXTRA_RECORD_ID, recordId)
      }

      return PendingIntent.getBroadcast(
        context,
        REQUEST_CODE_BASE + recordId.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private const val ACTION_SMS_QUICK_IMPORT = "expo.modules.widgets.action.SMS_QUICK_IMPORT"
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_SMS_QUICK_IMPORT) return

    val recordId = intent.getStringExtra(EXTRA_RECORD_ID) ?: return

    // Read the stored pending SMS details (for logging / diagnostics)
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val merchant = prefs.getString("${EXTRA_PREFIX}${recordId}_merchant", "") ?: ""
    val amount = prefs.getString("${EXTRA_PREFIX}${recordId}_amount", "") ?: ""

    // Set a flag so the app knows which record to auto-approve on launch
    prefs.edit().putString("${EXTRA_PREFIX}quick_approve", recordId).apply()

    // Open the app deep link to process the approval
    val deepLinkUri = Uri.parse("$APP_SCHEME://inbox?approve=$recordId")
    val launchIntent = Intent(Intent.ACTION_VIEW, deepLinkUri).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_CLEAR_TOP or
              Intent.FLAG_ACTIVITY_SINGLE_TOP
    }

    if (launchIntent.resolveActivity(context.packageManager) != null) {
      context.startActivity(launchIntent)
    } else {
      // If the deep link can't be resolved, clear the approval flag
      prefs.edit().remove("${EXTRA_PREFIX}quick_approve").apply()
    }

    // Refresh all widget timelines so the triage widget reflects the change
    refreshWidgets(context)
  }
}
