package __ANDROID_PACKAGE__ // expo-inject-androidpackage

import android.app.Activity
import android.app.AlertDialog
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import org.json.JSONArray

class WidgetWorkplaceConfigActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val appWidgetId = intent?.extras?.getInt(
      AppWidgetManager.EXTRA_APPWIDGET_ID,
      AppWidgetManager.INVALID_APPWIDGET_ID,
    ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
    val provider = AppWidgetManager.getInstance(this).getAppWidgetInfo(appWidgetId)?.provider
    val supportedProviders = setOf(
      "__ANDROID_PACKAGE_NAME__.SafeToSpendWidgetProvider",
      "__ANDROID_PACKAGE_NAME__.SafeToSpendActionsWidgetProvider",
      "__ANDROID_PACKAGE_NAME__.SafeToSpendActionsSquareWidgetProvider",
    )
    if (
      appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID ||
      provider == null ||
      provider.className !in supportedProviders
    ) {
      setResult(RESULT_CANCELED)
      finish()
      return
    }

    val prefs = getSharedPreferences("full_frills_balance_widgets", MODE_PRIVATE)
    val workplaces = JSONArray(prefs.getString("widget_workplace_catalog", "[]") ?: "[]")
    val choices: List<Pair<String, String>?> = listOf(null) + (0 until workplaces.length()).mapNotNull { index ->
      workplaces.optJSONObject(index)?.let { workplace ->
        workplace.optString("id").takeIf(String::isNotBlank)?.let { id ->
          id to workplace.optString("name", id)
        }
      }
    }
    val labels = choices.map { choice ->
      choice?.second ?: getString(R.string.widget_workplace_follow_active)
    }.toTypedArray()
    val selectedId = prefs.getString("widget_workplace_for_id_$appWidgetId", null)
    val selectedIndex = choices.indexOfFirst { it?.first == selectedId }.coerceAtLeast(0)

    AlertDialog.Builder(this)
      .setTitle(R.string.widget_workplace_selector_title)
      .setSingleChoiceItems(labels, selectedIndex) { dialog, which ->
        val editor = prefs.edit()
        choices[which]?.first?.let { editor.putString("widget_workplace_for_id_$appWidgetId", it) }
          ?: editor.remove("widget_workplace_for_id_$appWidgetId")
        editor.apply()

        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
        sendBroadcast(
          Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
            .setComponent(provider)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(appWidgetId)),
        )
        dialog.dismiss()
        finish()
      }
      .setOnCancelListener {
        setResult(RESULT_CANCELED)
        finish()
      }
      .show()
  }
}
