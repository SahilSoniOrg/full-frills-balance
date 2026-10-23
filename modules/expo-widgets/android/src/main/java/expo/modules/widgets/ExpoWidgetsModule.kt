package expo.modules.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

class ExpoWidgetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoWidgets")

    AsyncFunction("syncWidgetData") { snapshot: Map<String, Any?> ->
      val context: Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      syncSnapshot(context, snapshot)
      refreshWidgetProviders(context)
    }

    AsyncFunction("clearWidgetData") {
      val context: Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val cleared = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().clear().commit()
      if (!cleared) throw IllegalStateException("Widget storage could not be cleared")
      refreshWidgetProviders(context)
    }

    AsyncFunction("clearWidgetWorkplaceData") { workplaceId: String, activeWorkplaceId: String? ->
      val context: Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val snapshots = JSONObject(prefs.getString(KEY_SAFE_TO_SPEND_BY_WORKPLACE, "{}") ?: "{}")
      snapshots.remove(workplaceId)

      val storedWorkplaces = JSONArray(prefs.getString(KEY_WORKPLACE_CATALOG, "[]") ?: "[]")
      val workplaces = JSONArray()
      for (index in 0 until storedWorkplaces.length()) {
        val workplace = storedWorkplaces.optJSONObject(index) ?: continue
        if (workplace.optString("id") != workplaceId) workplaces.put(workplace)
      }

      val currentActiveWorkplaceId = prefs.getString(KEY_ACTIVE_WORKPLACE_ID, null)
      val nextActiveWorkplaceId = when {
        activeWorkplaceId == workplaceId -> null
        activeWorkplaceId != null -> activeWorkplaceId
        currentActiveWorkplaceId == workplaceId -> null
        else -> currentActiveWorkplaceId
      }
      val edit = prefs.edit()
        .putString(KEY_SAFE_TO_SPEND_BY_WORKPLACE, snapshots.toString())
        .putString(KEY_WORKPLACE_CATALOG, workplaces.toString())
      if (nextActiveWorkplaceId == null) edit.remove(KEY_ACTIVE_WORKPLACE_ID)
      else edit.putString(KEY_ACTIVE_WORKPLACE_ID, nextActiveWorkplaceId)
      prefs.all.forEach { (key, value) ->
        if (key.startsWith(KEY_WIDGET_WORKPLACE_PREFIX) && value == workplaceId) edit.remove(key)
      }
      edit.apply()
      refreshWidgetProviders(context)
    }
  }

  private fun syncSnapshot(context: Context, snapshot: Map<String, Any?>) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val safeToSpend = snapshot["safeToSpend"] as? Map<*, *>
    val theme = snapshot["theme"] as? Map<*, *>
    val workplaceId = (snapshot["workplaceId"] as? String)?.takeIf(String::isNotBlank)
    val workplaces = snapshot["workplaces"] as? List<*>
    val providedWorkplaceSnapshots = snapshot["safeToSpendByWorkplace"] as? Map<*, *>
    val workplaceSnapshots = providedWorkplaceSnapshots?.let { provided ->
      JSONObject().apply {
        provided.forEach { (id, data) ->
          val workplaceId = id as? String ?: return@forEach
          val safeToSpendSnapshot = data as? Map<*, *> ?: return@forEach
          put(workplaceId, safeToSpendJson(safeToSpendSnapshot))
        }
      }
    } ?: JSONObject(prefs.getString(KEY_SAFE_TO_SPEND_BY_WORKPLACE, "{}") ?: "{}")
    if (workplaceId != null) {
      if (safeToSpend == null && providedWorkplaceSnapshots == null) {
        workplaceSnapshots.remove(workplaceId)
      } else if (safeToSpend != null) {
        workplaceSnapshots.put(workplaceId, safeToSpendJson(safeToSpend))
      }
    }
    val workplaceCatalog = workplaces?.let { items ->
      JSONArray().apply {
        items.forEach { item ->
          val workplace = item as? Map<*, *> ?: return@forEach
          val id = workplace["id"] as? String ?: return@forEach
          put(JSONObject().apply {
            put("id", id)
            put("name", workplace["name"] as? String ?: id)
          })
        }
      }
    }

    prefs.edit().apply {
      if (workplaceId != null) {
        putString(KEY_ACTIVE_WORKPLACE_ID, workplaceId)
        putString(KEY_SAFE_TO_SPEND_BY_WORKPLACE, workplaceSnapshots.toString())
        workplaceCatalog?.let { putString(KEY_WORKPLACE_CATALOG, it.toString()) }
        remove(KEY_SAFE_TO_SPEND_AMOUNT)
        remove(KEY_SAFE_TO_SPEND_CURRENCY)
        remove(KEY_SAFE_TO_SPEND_FORMATTED_AMOUNT)
        remove(KEY_SAFE_TO_SPEND_TITLE)
        remove(KEY_SAFE_TO_SPEND_SUBTITLE)
        remove(KEY_SAFE_TO_SPEND_UPDATED_AT)
      } else if (safeToSpend == null) {
        remove(KEY_SAFE_TO_SPEND_AMOUNT)
        remove(KEY_SAFE_TO_SPEND_CURRENCY)
        remove(KEY_SAFE_TO_SPEND_FORMATTED_AMOUNT)
        remove(KEY_SAFE_TO_SPEND_TITLE)
        remove(KEY_SAFE_TO_SPEND_SUBTITLE)
        remove(KEY_SAFE_TO_SPEND_UPDATED_AT)
      } else {
        putFloat(KEY_SAFE_TO_SPEND_AMOUNT, (safeToSpend["amount"] as? Number)?.toFloat() ?: 0f)
        putString(KEY_SAFE_TO_SPEND_CURRENCY, safeToSpend["currencyCode"] as? String ?: "")
        putString(KEY_SAFE_TO_SPEND_FORMATTED_AMOUNT, safeToSpend["formattedAmount"] as? String ?: "")
        putString(KEY_SAFE_TO_SPEND_TITLE, safeToSpend["title"] as? String ?: "")
        putString(KEY_SAFE_TO_SPEND_SUBTITLE, safeToSpend["subtitle"] as? String ?: "")
        putLong(KEY_SAFE_TO_SPEND_UPDATED_AT, (safeToSpend["updatedAt"] as? Number)?.toLong() ?: System.currentTimeMillis())
      }

      if (theme == null) {
        remove(KEY_THEME_ID)
        remove(KEY_THEME_MODE)
        remove(KEY_THEME_BACKGROUND_START)
        remove(KEY_THEME_TITLE_COLOR)
        remove(KEY_THEME_PRIMARY_TEXT_COLOR)
        remove(KEY_THEME_SECONDARY_TEXT_COLOR)
        remove(KEY_THEME_ACTION_ICON_COLOR)
        remove(KEY_THEME_INCOME_ACCENT_COLOR)
        remove(KEY_THEME_EXPENSE_ACCENT_COLOR)
        remove(KEY_THEME_TRANSFER_ACCENT_COLOR)
      } else {
        putString(KEY_THEME_ID, theme["themeId"] as? String ?: "")
        putString(KEY_THEME_MODE, theme["themeMode"] as? String ?: "")
        putString(KEY_THEME_BACKGROUND_START, theme["backgroundStartColor"] as? String ?: "")
        putString(KEY_THEME_TITLE_COLOR, theme["titleColor"] as? String ?: "")
        putString(KEY_THEME_PRIMARY_TEXT_COLOR, theme["primaryTextColor"] as? String ?: "")
        putString(KEY_THEME_SECONDARY_TEXT_COLOR, theme["secondaryTextColor"] as? String ?: "")
        putString(KEY_THEME_ACTION_ICON_COLOR, theme["actionIconColor"] as? String ?: "")
        putString(KEY_THEME_INCOME_ACCENT_COLOR, theme["incomeAccentColor"] as? String ?: "")
        putString(KEY_THEME_EXPENSE_ACCENT_COLOR, theme["expenseAccentColor"] as? String ?: "")
        putString(KEY_THEME_TRANSFER_ACCENT_COLOR, theme["transferAccentColor"] as? String ?: "")
      }
      remove(KEY_LEGACY_THEME_BACKGROUND_END)
      putBoolean(KEY_IS_PRIVACY_ENABLED, snapshot["isPrivacyEnabled"] as? Boolean ?: false)
    }.apply()
  }

  private fun safeToSpendJson(snapshot: Map<*, *>): JSONObject = JSONObject().apply {
    put("amount", (snapshot["amount"] as? Number)?.toDouble() ?: 0.0)
    put("currencyCode", snapshot["currencyCode"] as? String ?: "")
    put("formattedAmount", snapshot["formattedAmount"] as? String ?: "")
    put("title", snapshot["title"] as? String ?: "")
    put("subtitle", snapshot["subtitle"] as? String ?: "")
    put("updatedAt", (snapshot["updatedAt"] as? Number)?.toLong() ?: System.currentTimeMillis())
  }

  private fun refreshWidgetProviders(context: Context) {
    val appWidgetManager = AppWidgetManager.getInstance(context)

    WIDGET_PROVIDER_CLASS_NAMES.forEach { className ->
      runCatching {
        val providerClass = Class
          .forName("${context.packageName}.$className")
          .asSubclass(AppWidgetProvider::class.java)

        val componentName = ComponentName(context, providerClass)
        val ids = appWidgetManager.getAppWidgetIds(componentName)
        if (ids.isEmpty()) {
          return@runCatching
        }

        val updateIntent = Intent(context, providerClass).apply {
          action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        }
        context.sendBroadcast(updateIntent)
      }
    }
  }

  companion object {
    private const val PREFS_NAME = "full_frills_balance_widgets"
    private const val KEY_ACTIVE_WORKPLACE_ID = "widget_active_workplace_id"
    private const val KEY_WORKPLACE_CATALOG = "widget_workplace_catalog"
    private const val KEY_SAFE_TO_SPEND_BY_WORKPLACE = "safe_to_spend_by_workplace"
    private const val KEY_WIDGET_WORKPLACE_PREFIX = "widget_workplace_for_id_"
    private const val KEY_SAFE_TO_SPEND_AMOUNT = "safe_to_spend_amount"
    private const val KEY_SAFE_TO_SPEND_CURRENCY = "safe_to_spend_currency"
    private const val KEY_SAFE_TO_SPEND_FORMATTED_AMOUNT = "safe_to_spend_formatted_amount"
    private const val KEY_SAFE_TO_SPEND_TITLE = "safe_to_spend_title"
    private const val KEY_SAFE_TO_SPEND_SUBTITLE = "safe_to_spend_subtitle"
    private const val KEY_SAFE_TO_SPEND_UPDATED_AT = "safe_to_spend_updated_at"
    private const val KEY_THEME_ID = "widget_theme_id"
    private const val KEY_THEME_MODE = "widget_theme_mode"
    private const val KEY_THEME_BACKGROUND_START = "widget_theme_background_start"
    private const val KEY_LEGACY_THEME_BACKGROUND_END = "widget_theme_background_end"
    private const val KEY_THEME_TITLE_COLOR = "widget_theme_title_color"
    private const val KEY_THEME_PRIMARY_TEXT_COLOR = "widget_theme_primary_text_color"
    private const val KEY_THEME_SECONDARY_TEXT_COLOR = "widget_theme_secondary_text_color"
    private const val KEY_THEME_ACTION_ICON_COLOR = "widget_theme_action_icon_color"
    private const val KEY_THEME_INCOME_ACCENT_COLOR = "widget_theme_income_accent_color"
    private const val KEY_THEME_EXPENSE_ACCENT_COLOR = "widget_theme_expense_accent_color"
    private const val KEY_THEME_TRANSFER_ACCENT_COLOR = "widget_theme_transfer_accent_color"
    private const val KEY_IS_PRIVACY_ENABLED = "widget_is_privacy_enabled"
    private val WIDGET_PROVIDER_CLASS_NAMES = listOf(
      "JournalLauncherWidgetProvider",
      "SafeToSpendWidgetProvider",
      "SafeToSpendActionsWidgetProvider",
      "SafeToSpendActionsSquareWidgetProvider",
    )
  }
}
