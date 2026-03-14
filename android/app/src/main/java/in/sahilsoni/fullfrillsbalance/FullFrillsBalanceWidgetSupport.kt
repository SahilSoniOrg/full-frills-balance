package `in`.sahilsoni.fullfrillsbalance

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.widget.RemoteViews

data class SafeToSpendWidgetSnapshot(
  val amount: Double,
  val currencyCode: String,
  val formattedAmount: String,
  val title: String,
  val subtitle: String,
  val updatedAt: Long,
)

data class WidgetThemeSnapshot(
  val themeId: String,
  val themeMode: String,
  val titleColor: Int,
  val primaryTextColor: Int,
  val secondaryTextColor: Int,
  val actionIconColor: Int,
)

object FullFrillsBalanceWidgetSupport {
  private const val PREFS_NAME = "full_frills_balance_widgets"
  private const val KEY_SAFE_TO_SPEND_AMOUNT = "safe_to_spend_amount"
  private const val KEY_SAFE_TO_SPEND_CURRENCY = "safe_to_spend_currency"
  private const val KEY_SAFE_TO_SPEND_FORMATTED_AMOUNT = "safe_to_spend_formatted_amount"
  private const val KEY_SAFE_TO_SPEND_TITLE = "safe_to_spend_title"
  private const val KEY_SAFE_TO_SPEND_SUBTITLE = "safe_to_spend_subtitle"
  private const val KEY_SAFE_TO_SPEND_UPDATED_AT = "safe_to_spend_updated_at"
  private const val KEY_THEME_ID = "widget_theme_id"
  private const val KEY_THEME_MODE = "widget_theme_mode"
  private const val KEY_THEME_TITLE_COLOR = "widget_theme_title_color"
  private const val KEY_THEME_PRIMARY_TEXT_COLOR = "widget_theme_primary_text_color"
  private const val KEY_THEME_SECONDARY_TEXT_COLOR = "widget_theme_secondary_text_color"
  private const val KEY_THEME_ACTION_ICON_COLOR = "widget_theme_action_icon_color"
  private const val KEY_IS_PRIVACY_ENABLED = "widget_is_privacy_enabled"
  private const val APP_HOME_DEEP_LINK = "fullfrillsbalance://"
  private const val INCOME_DEEP_LINK = "fullfrillsbalance://journal-entry?mode=simple&type=income&source=widget"
  private const val EXPENSE_DEEP_LINK = "fullfrillsbalance://journal-entry?mode=simple&type=expense&source=widget"
  private const val TRANSFER_DEEP_LINK = "fullfrillsbalance://journal-entry?mode=simple&type=transfer&source=widget"

  fun readSafeToSpendSnapshot(context: Context): SafeToSpendWidgetSnapshot? {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val formattedAmount = prefs.getString(KEY_SAFE_TO_SPEND_FORMATTED_AMOUNT, null) ?: return null

    return SafeToSpendWidgetSnapshot(
      amount = prefs.getFloat(KEY_SAFE_TO_SPEND_AMOUNT, 0f).toDouble(),
      currencyCode = prefs.getString(KEY_SAFE_TO_SPEND_CURRENCY, "") ?: "",
      formattedAmount = formattedAmount,
      title = prefs.getString(KEY_SAFE_TO_SPEND_TITLE, context.getString(R.string.safe_to_spend_widget_title)) ?: "",
      subtitle = prefs.getString(KEY_SAFE_TO_SPEND_SUBTITLE, context.getString(R.string.safe_to_spend_widget_subtitle)) ?: "",
      updatedAt = prefs.getLong(KEY_SAFE_TO_SPEND_UPDATED_AT, 0L),
    )
  }

  fun readThemeSnapshot(context: Context): WidgetThemeSnapshot? {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val themeId = prefs.getString(KEY_THEME_ID, null) ?: return null

    return WidgetThemeSnapshot(
      themeId = themeId,
      themeMode = prefs.getString(KEY_THEME_MODE, "dark") ?: "dark",
      titleColor = parseColorOrDefault(
        prefs.getString(KEY_THEME_TITLE_COLOR, null),
        Color.parseColor("#B8D6EB"),
      ),
      primaryTextColor = parseColorOrDefault(
        prefs.getString(KEY_THEME_PRIMARY_TEXT_COLOR, null),
        Color.WHITE,
      ),
      secondaryTextColor = parseColorOrDefault(
        prefs.getString(KEY_THEME_SECONDARY_TEXT_COLOR, null),
        Color.parseColor("#D9EAF6"),
      ),
      actionIconColor = parseColorOrDefault(
        prefs.getString(KEY_THEME_ACTION_ICON_COLOR, null),
        Color.parseColor("#023C69"),
      ),
    )
  }

  fun bindSafeToSpend(
    context: Context,
    remoteViews: RemoteViews,
    titleViewId: Int,
    amountViewId: Int,
    subtitleViewId: Int,
  ) {
    val snapshot = readSafeToSpendSnapshot(context)
    if (snapshot == null) {
      remoteViews.setTextViewText(titleViewId, context.getString(R.string.safe_to_spend_widget_title))
      remoteViews.setTextViewText(amountViewId, context.getString(R.string.safe_to_spend_widget_amount_placeholder))
      remoteViews.setTextViewText(subtitleViewId, context.getString(R.string.safe_to_spend_widget_loading))
      return
    }

    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val isPrivacyEnabled = prefs.getBoolean(KEY_IS_PRIVACY_ENABLED, false)
    val displayAmount = if (isPrivacyEnabled) "****" else snapshot.formattedAmount

    remoteViews.setTextViewText(titleViewId, snapshot.title)
    remoteViews.setTextViewText(amountViewId, displayAmount)
    remoteViews.setTextViewText(subtitleViewId, snapshot.subtitle)
  }

  fun applySafeToSpendTheme(
    context: Context,
    remoteViews: RemoteViews,
    rootViewId: Int,
    titleViewId: Int,
    amountViewId: Int,
    subtitleViewId: Int,
  ) {
    val theme = readThemeSnapshot(context)
    remoteViews.setInt(
      rootViewId,
      "setBackgroundResource",
      resolveBackgroundDrawable(theme?.themeId, theme?.themeMode),
    )
    remoteViews.setTextColor(titleViewId, theme?.titleColor ?: Color.parseColor("#B8D6EB"))
    remoteViews.setTextColor(amountViewId, theme?.primaryTextColor ?: Color.WHITE)
    remoteViews.setTextColor(subtitleViewId, theme?.secondaryTextColor ?: Color.parseColor("#D9EAF6"))
  }

  fun applyLauncherTheme(
    context: Context,
    remoteViews: RemoteViews,
    containerViewId: Int,
    actionIconViewIds: IntArray,
  ) {
    val theme = readThemeSnapshot(context)
    remoteViews.setInt(
      containerViewId,
      "setBackgroundResource",
      resolveBackgroundDrawable(theme?.themeId, theme?.themeMode),
    )
    actionIconViewIds.forEach { viewId ->
      remoteViews.setInt(viewId, "setColorFilter", theme?.actionIconColor ?: Color.parseColor("#7DD3A8"))
    }
  }

  fun applySafeToSpendActionsTheme(
    context: Context,
    remoteViews: RemoteViews,
    rootViewId: Int,
    titleViewId: Int,
    amountViewId: Int,
    subtitleViewId: Int,
    actionLabelViewIds: IntArray,
    actionIconViewIds: IntArray,
  ) {
    val theme = readThemeSnapshot(context)
    applySafeToSpendTheme(
      context = context,
      remoteViews = remoteViews,
      rootViewId = rootViewId,
      titleViewId = titleViewId,
      amountViewId = amountViewId,
      subtitleViewId = subtitleViewId,
    )
    actionLabelViewIds.forEach { viewId ->
      remoteViews.setTextColor(viewId, theme?.primaryTextColor ?: Color.WHITE)
    }
    actionIconViewIds.forEach { viewId ->
      remoteViews.setInt(viewId, "setColorFilter", theme?.actionIconColor ?: Color.parseColor("#023C69"))
    }
  }

  fun bindTransactionButtons(
    context: Context,
    remoteViews: RemoteViews,
    incomeViewId: Int,
    expenseViewId: Int,
    transferViewId: Int,
  ) {
    remoteViews.setOnClickPendingIntent(
      incomeViewId,
      createLaunchPendingIntent(context, 1001, INCOME_DEEP_LINK),
    )
    remoteViews.setOnClickPendingIntent(
      expenseViewId,
      createLaunchPendingIntent(context, 1002, EXPENSE_DEEP_LINK),
    )
    remoteViews.setOnClickPendingIntent(
      transferViewId,
      createLaunchPendingIntent(context, 1003, TRANSFER_DEEP_LINK),
    )
  }

  fun createOpenAppPendingIntent(context: Context, requestCode: Int): PendingIntent {
    return createLaunchPendingIntent(context, requestCode, APP_HOME_DEEP_LINK)
  }

  fun refreshAll(context: Context) {
    refreshProvider(context, JournalLauncherWidgetProvider::class.java)
    refreshProvider(context, SafeToSpendWidgetProvider::class.java)
    refreshProvider(context, SafeToSpendActionsWidgetProvider::class.java)
    refreshProvider(context, SafeToSpendActionsSquareWidgetProvider::class.java)
  }

  private fun refreshProvider(context: Context, providerClass: Class<out AppWidgetProvider>) {
    val appWidgetManager = AppWidgetManager.getInstance(context)
    val componentName = ComponentName(context, providerClass)
    val ids = appWidgetManager.getAppWidgetIds(componentName)
    if (ids.isEmpty()) {
      return
    }

    val updateIntent = Intent(context, providerClass).apply {
      action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
    }
    context.sendBroadcast(updateIntent)
  }

  private fun createLaunchPendingIntent(
    context: Context,
    requestCode: Int,
    deepLink: String,
  ): PendingIntent {
    return PendingIntent.getActivity(
      context,
      requestCode,
      Intent(Intent.ACTION_VIEW, Uri.parse(deepLink), context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_CLEAR_TOP or
          Intent.FLAG_ACTIVITY_SINGLE_TOP
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun resolveBackgroundDrawable(themeId: String?, themeMode: String?): Int {
    return when {
      themeId == "ivy" && themeMode == "light" -> R.drawable.widget_journal_launcher_background_ivy_light
      themeId == "ivy" -> R.drawable.widget_journal_launcher_background_ivy
      themeMode == "light" -> R.drawable.widget_journal_launcher_background_light
      else -> R.drawable.widget_journal_launcher_background
    }
  }

  private fun parseColorOrDefault(color: String?, fallback: Int): Int {
    if (color.isNullOrBlank()) {
      return fallback
    }
    return runCatching { Color.parseColor(color) }.getOrDefault(fallback)
  }
}
