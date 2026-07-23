package expo.modules.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import org.json.JSONArray
import org.json.JSONObject

class PendingSmsRecord : Record {
  @Field val id: String = ""
  @Field val merchant: String = ""
  @Field val amount: String = ""
  @Field val currency: String = ""
  @Field val sender: String = ""
  @Field val date: Long? = null
  @Field val processingStatus: String = "pending"
}

class ExpoWidgetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoWidgets")

    AsyncFunction("syncWidgetData") { snapshot: Map<String, Any?> ->
      val context: Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      syncSnapshot(context, snapshot)
      refreshWidgetProviders(context)
    }

    AsyncFunction("refreshWidgets") {
      val context: Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      refreshWidgetProviders(context)
    }

    AsyncFunction("storePendingSms") { records: List<PendingSmsRecord> ->
      val context: Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      storePendingSmsRecords(context, records)
      refreshWidgetProviders(context)
    }
  }

  private fun storePendingSmsRecords(context: Context, records: List<PendingSmsRecord>) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // Filter only pending records and sort by recency (newest date first; null date -> 0L)
    val pendingRecords = records
      .filter { it.processingStatus == "pending" }
      .sortedByDescending { it.date ?: 0L }

    // Collect existing record IDs (for cleanup of stale entries)
    val existingJson = prefs.getString(KEY_PENDING_SMS_RECORDS, null)
    val previousIds = mutableSetOf<String>()
    if (existingJson != null) {
      try {
        val arr = JSONArray(existingJson)
        for (i in 0 until arr.length()) {
          previousIds.add(arr.getString(i))
        }
      } catch (e: Exception) {
        android.util.Log.e("ExpoWidgets", "Failed to parse existing pending SMS records", e)
      }
    }

    val currentIds = mutableListOf<String>()
    val cleanIds = mutableSetOf<String>()

    prefs.edit().apply {
      for (record in pendingRecords) {
        val id = record.id
        if (id.isEmpty()) continue
        currentIds.add(id)
        cleanIds.add(id)

        putString("${SmsQuickImportReceiver.EXTRA_PREFIX}${id}_merchant", record.merchant)
        putString("${SmsQuickImportReceiver.EXTRA_PREFIX}${id}_amount", record.amount)
        putString("${SmsQuickImportReceiver.EXTRA_PREFIX}${id}_currency", record.currency)
        putString("${SmsQuickImportReceiver.EXTRA_PREFIX}${id}_sender", record.sender)
        putLong("${SmsQuickImportReceiver.EXTRA_PREFIX}${id}_date", record.date ?: 0L)
      }

      // Store the ordered list of record IDs as JSON array
      putString(KEY_PENDING_SMS_RECORDS, JSONArray(currentIds).toString())

      // Clean up stale entries that are no longer in the new records
      val staleIds = previousIds - cleanIds
      for (staleId in staleIds) {
        remove("${SmsQuickImportReceiver.EXTRA_PREFIX}${staleId}_merchant")
        remove("${SmsQuickImportReceiver.EXTRA_PREFIX}${staleId}_amount")
        remove("${SmsQuickImportReceiver.EXTRA_PREFIX}${staleId}_currency")
        remove("${SmsQuickImportReceiver.EXTRA_PREFIX}${staleId}_sender")
        remove("${SmsQuickImportReceiver.EXTRA_PREFIX}${staleId}_date")
      }
    }.apply()
  }

  private fun syncSnapshot(context: Context, snapshot: Map<String, Any?>) {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val safeToSpend = snapshot["safeToSpend"] as? Map<*, *>
    val theme = snapshot["theme"] as? Map<*, *>
    val streak = snapshot["streak"] as? Map<*, *>
    @Suppress("UNCHECKED_CAST")
    val pendingSms = snapshot["pendingSms"] as? List<Map<*, *>>
    val pet = snapshot["pet"] as? Map<*, *>

    prefs.edit().apply {
      // ---- safeToSpend ------------------------------------------------
      if (safeToSpend == null) {
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

      // ---- theme -------------------------------------------------------
      if (theme == null) {
        remove(KEY_THEME_ID)
        remove(KEY_THEME_MODE)
        remove(KEY_THEME_BACKGROUND_START)
        remove(KEY_THEME_BACKGROUND_END)
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
        putString(KEY_THEME_BACKGROUND_END, theme["backgroundEndColor"] as? String ?: "")
        putString(KEY_THEME_TITLE_COLOR, theme["titleColor"] as? String ?: "")
        putString(KEY_THEME_PRIMARY_TEXT_COLOR, theme["primaryTextColor"] as? String ?: "")
        putString(KEY_THEME_SECONDARY_TEXT_COLOR, theme["secondaryTextColor"] as? String ?: "")
        putString(KEY_THEME_ACTION_ICON_COLOR, theme["actionIconColor"] as? String ?: "")
        putString(KEY_THEME_INCOME_ACCENT_COLOR, theme["incomeAccentColor"] as? String ?: "")
        putString(KEY_THEME_EXPENSE_ACCENT_COLOR, theme["expenseAccentColor"] as? String ?: "")
        putString(KEY_THEME_TRANSFER_ACCENT_COLOR, theme["transferAccentColor"] as? String ?: "")
      }

      putBoolean(KEY_IS_PRIVACY_ENABLED, snapshot["isPrivacyEnabled"] as? Boolean ?: false)

      // ---- streak ------------------------------------------------------
      if (streak == null) {
        remove(KEY_STREAK_COUNT)
        remove(KEY_STREAK_TODAY_LOGGED)
        remove(KEY_STREAK_LAST_LOGGED_DATE)
        remove(KEY_STREAK_CAN_RECOVER)
        remove(KEY_STREAK_MISSED_DAYS)
      } else {
        putInt(KEY_STREAK_COUNT, (streak["count"] as? Number)?.toInt() ?: 0)
        putBoolean(KEY_STREAK_TODAY_LOGGED, streak["todayLogged"] as? Boolean ?: false)
        putString(KEY_STREAK_LAST_LOGGED_DATE, streak["lastLoggedDate"] as? String ?: "")
        putBoolean(KEY_STREAK_CAN_RECOVER, streak["canRecover"] as? Boolean ?: false)
        putInt(KEY_STREAK_MISSED_DAYS, (streak["missedDays"] as? Number)?.toInt() ?: 0)
      }

      // ---- pendingSms --------------------------------------------------
      if (pendingSms == null) {
        remove(KEY_PENDING_SMS_COUNT)
        for (i in 0 until MAX_PENDING_SMS) {
          remove("${KEY_PENDING_SMS_PREFIX}${i}_id")
          remove("${KEY_PENDING_SMS_PREFIX}${i}_merchant")
          remove("${KEY_PENDING_SMS_PREFIX}${i}_amount")
          remove("${KEY_PENDING_SMS_PREFIX}${i}_currency")
        }
      } else {
        val count = minOf(pendingSms.size, MAX_PENDING_SMS)
        putInt(KEY_PENDING_SMS_COUNT, count)
        for (i in 0 until count) {
          val item = pendingSms[i]
          val amountNum = (item["amount"] as? Number)?.toDouble() ?: 0.0
          val amountStr = String.format(java.util.Locale.US, "%.2f", amountNum)
          putString("${KEY_PENDING_SMS_PREFIX}${i}_id", item["id"] as? String ?: "")
          putString("${KEY_PENDING_SMS_PREFIX}${i}_merchant", item["merchant"] as? String ?: "")
          putString("${KEY_PENDING_SMS_PREFIX}${i}_amount", amountStr)
          putString("${KEY_PENDING_SMS_PREFIX}${i}_currency", item["currency"] as? String ?: "")
        }
        // Clear stale slots
        for (i in count until MAX_PENDING_SMS) {
          remove("${KEY_PENDING_SMS_PREFIX}${i}_id")
          remove("${KEY_PENDING_SMS_PREFIX}${i}_merchant")
          remove("${KEY_PENDING_SMS_PREFIX}${i}_amount")
          remove("${KEY_PENDING_SMS_PREFIX}${i}_currency")
        }
      }

      // ---- pet ---------------------------------------------------------
      if (pet == null) {
        remove(KEY_PET_HEALTH)
        remove(KEY_PET_MOOD)
        remove(KEY_PET_LEVEL)
      } else {
        putInt(KEY_PET_HEALTH, (pet["health"] as? Number)?.toInt() ?: 50)
        putString(KEY_PET_MOOD, pet["mood"] as? String ?: "happy")
        putInt(KEY_PET_LEVEL, (pet["level"] as? Number)?.toInt() ?: 1)
      }
    }.apply()
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
    const val PREFS_NAME = "full_frills_balance_widgets"
    private const val MAX_PENDING_SMS = 5

    // safeToSpend
    private const val KEY_SAFE_TO_SPEND_AMOUNT = "safe_to_spend_amount"
    private const val KEY_SAFE_TO_SPEND_CURRENCY = "safe_to_spend_currency"
    private const val KEY_SAFE_TO_SPEND_FORMATTED_AMOUNT = "safe_to_spend_formatted_amount"
    private const val KEY_SAFE_TO_SPEND_TITLE = "safe_to_spend_title"
    private const val KEY_SAFE_TO_SPEND_SUBTITLE = "safe_to_spend_subtitle"
    private const val KEY_SAFE_TO_SPEND_UPDATED_AT = "safe_to_spend_updated_at"

    // theme
    private const val KEY_THEME_ID = "widget_theme_id"
    private const val KEY_THEME_MODE = "widget_theme_mode"
    private const val KEY_THEME_BACKGROUND_START = "widget_theme_background_start"
    private const val KEY_THEME_BACKGROUND_END = "widget_theme_background_end"
    private const val KEY_THEME_TITLE_COLOR = "widget_theme_title_color"
    private const val KEY_THEME_PRIMARY_TEXT_COLOR = "widget_theme_primary_text_color"
    private const val KEY_THEME_SECONDARY_TEXT_COLOR = "widget_theme_secondary_text_color"
    private const val KEY_THEME_ACTION_ICON_COLOR = "widget_theme_action_icon_color"
    private const val KEY_THEME_INCOME_ACCENT_COLOR = "widget_theme_income_accent_color"
    private const val KEY_THEME_EXPENSE_ACCENT_COLOR = "widget_theme_expense_accent_color"
    private const val KEY_THEME_TRANSFER_ACCENT_COLOR = "widget_theme_transfer_accent_color"

    // privacy
    private const val KEY_IS_PRIVACY_ENABLED = "widget_is_privacy_enabled"
    private const val KEY_PENDING_SMS_RECORDS = "pending_sms_records"

    // streak
    private const val KEY_STREAK_COUNT = "streak_count"
    private const val KEY_STREAK_TODAY_LOGGED = "streak_today_logged"
    private const val KEY_STREAK_LAST_LOGGED_DATE = "streak_last_logged_date"
    private const val KEY_STREAK_CAN_RECOVER = "streak_can_recover"
    private const val KEY_STREAK_MISSED_DAYS = "streak_missed_days"

    // pendingSms
    private const val KEY_PENDING_SMS_COUNT = "pending_sms_count"
    private const val KEY_PENDING_SMS_PREFIX = "pending_sms_"

    // pet
    private const val KEY_PET_HEALTH = "pet_health"
    private const val KEY_PET_MOOD = "pet_mood"
    private const val KEY_PET_LEVEL = "pet_level"

    val WIDGET_PROVIDER_CLASS_NAMES = listOf(
      "JournalLauncherWidgetProvider",
      "SafeToSpendWidgetProvider",
      "SafeToSpendActionsWidgetProvider",
      "SafeToSpendActionsSquareWidgetProvider",
      "StreakPetWidgetProvider",
      "SmsTriageWidgetProvider",
    )
  }
}
