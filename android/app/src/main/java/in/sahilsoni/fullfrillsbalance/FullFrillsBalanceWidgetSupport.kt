package `in`.sahilsoni.fullfrillsbalance // expo-inject-androidpackage

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.text.format.DateFormat
import android.text.format.DateUtils
import android.view.View
import android.widget.RemoteViews
import java.util.Date

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
  val backgroundStartColor: Int,
  val titleColor: Int,
  val primaryTextColor: Int,
  val secondaryTextColor: Int,
  val actionIconColor: Int,
  val incomeAccentColor: Int,
  val expenseAccentColor: Int,
  val transferAccentColor: Int,
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
  private const val KEY_THEME_BACKGROUND_START = "widget_theme_background_start"
  private const val KEY_THEME_TITLE_COLOR = "widget_theme_title_color"
  private const val KEY_THEME_PRIMARY_TEXT_COLOR = "widget_theme_primary_text_color"
  private const val KEY_THEME_SECONDARY_TEXT_COLOR = "widget_theme_secondary_text_color"
  private const val KEY_THEME_ACTION_ICON_COLOR = "widget_theme_action_icon_color"
  private const val KEY_THEME_INCOME_ACCENT_COLOR = "widget_theme_income_accent_color"
  private const val KEY_THEME_EXPENSE_ACCENT_COLOR = "widget_theme_expense_accent_color"
  private const val KEY_THEME_TRANSFER_ACCENT_COLOR = "widget_theme_transfer_accent_color"
  private const val KEY_IS_PRIVACY_ENABLED = "widget_is_privacy_enabled"
  private const val APP_SCHEME = "fullfrillsbalance" // expo-inject-appscheme
  private const val APP_HOME_DEEP_LINK = "$APP_SCHEME://?source=widget"
  private const val INCOME_DEEP_LINK = "$APP_SCHEME://journal-entry?mode=simple&type=income&source=widget"
  private const val EXPENSE_DEEP_LINK = "$APP_SCHEME://journal-entry?mode=simple&type=expense&source=widget"
  private const val TRANSFER_DEEP_LINK = "$APP_SCHEME://journal-entry?mode=simple&type=transfer&source=widget"

  fun readSafeToSpendSnapshot(context: Context): SafeToSpendWidgetSnapshot? {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val formattedAmount = prefs.getString(KEY_SAFE_TO_SPEND_FORMATTED_AMOUNT, null) ?: return null

    return SafeToSpendWidgetSnapshot(
      amount = prefs.getFloat(KEY_SAFE_TO_SPEND_AMOUNT, 0f).toDouble(),
      currencyCode = prefs.getString(KEY_SAFE_TO_SPEND_CURRENCY, "") ?: "",
      formattedAmount = formattedAmount,
      title = prefs.getString(KEY_SAFE_TO_SPEND_TITLE, context.getString(R.string.safe_to_spend_widget_title)) ?: "",
      subtitle = prefs.getString(KEY_SAFE_TO_SPEND_SUBTITLE, context.getString(R.string.safe_to_spend_widget_subtitle))
        ?: "",
      updatedAt = prefs.getLong(KEY_SAFE_TO_SPEND_UPDATED_AT, 0L),
    )
  }

  fun readThemeSnapshot(context: Context): WidgetThemeSnapshot? {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val themeId = prefs.getString(KEY_THEME_ID, null) ?: return null
    val themeMode = prefs.getString(KEY_THEME_MODE, "dark") ?: "dark"

    return WidgetThemeSnapshot(
      themeId = themeId,
      themeMode = themeMode,
      backgroundStartColor = parseColorOrDefault(
        prefs.getString(KEY_THEME_BACKGROUND_START, null),
        if (themeMode == "light") Color.WHITE else Color.parseColor("#1E1E26"),
      ),
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
      incomeAccentColor = parseColorOrDefault(
        prefs.getString(KEY_THEME_INCOME_ACCENT_COLOR, null),
        Color.parseColor("#DDF6E5"),
      ),
      expenseAccentColor = parseColorOrDefault(
        prefs.getString(KEY_THEME_EXPENSE_ACCENT_COLOR, null),
        Color.parseColor("#FDE5E3"),
      ),
      transferAccentColor = parseColorOrDefault(
        prefs.getString(KEY_THEME_TRANSFER_ACCENT_COLOR, null),
        Color.parseColor("#E6F4FE"),
      ),
    )
  }

  fun bindSafeToSpend(
    context: Context,
    remoteViews: RemoteViews,
    titleViewId: Int,
    amountViewId: Int,
    subtitleViewId: Int,
    updatedAtViewId: Int? = null,
  ) {
    val snapshot = readSafeToSpendSnapshot(context)
    if (snapshot == null) {
      remoteViews.setTextViewText(titleViewId, context.getString(R.string.safe_to_spend_widget_title))
      remoteViews.setTextViewText(amountViewId, context.getString(R.string.safe_to_spend_widget_amount_placeholder))
      remoteViews.setTextViewText(subtitleViewId, context.getString(R.string.safe_to_spend_widget_loading))
      updatedAtViewId?.let { remoteViews.setViewVisibility(it, View.GONE) }
      return
    }

    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val isPrivacyEnabled = prefs.getBoolean(KEY_IS_PRIVACY_ENABLED, false)
    val displayAmount = if (isPrivacyEnabled) "****" else snapshot.formattedAmount

    remoteViews.setTextViewText(titleViewId, snapshot.title)
    remoteViews.setTextViewText(amountViewId, displayAmount)
    remoteViews.setTextViewText(subtitleViewId, snapshot.subtitle)
    updatedAtViewId?.let { viewId ->
      if (snapshot.updatedAt > 0L && !isPrivacyEnabled) {
        val date = Date(snapshot.updatedAt)
        val calculatedAt = if (DateUtils.isToday(snapshot.updatedAt)) {
          DateFormat.getTimeFormat(context).format(date)
        } else {
          DateFormat.getDateFormat(context).format(date)
        }
        remoteViews.setTextViewText(
          viewId,
          context.getString(R.string.safe_to_spend_widget_calculated_at, calculatedAt),
        )
        remoteViews.setViewVisibility(viewId, View.VISIBLE)
      } else {
        remoteViews.setViewVisibility(viewId, View.GONE)
      }
    }
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
    theme?.let { applyBackgroundTint(remoteViews, rootViewId, it.backgroundStartColor) }
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
    theme?.let { applyBackgroundTint(remoteViews, containerViewId, it.backgroundStartColor) }
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
    actionBackgroundViewIds: IntArray,
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
    val actionBackgroundColors = theme?.let {
      intArrayOf(it.incomeAccentColor, it.expenseAccentColor, it.transferAccentColor)
    } ?: intArrayOf(
      Color.parseColor("#DDF6E5"),
      Color.parseColor("#FDE5E3"),
      Color.parseColor("#E6F4FE"),
    )
    actionBackgroundViewIds.forEachIndexed { index, viewId ->
      actionBackgroundColors.getOrNull(index)?.let { color ->
        applyBackgroundTint(remoteViews, viewId, color)
      }
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

  private fun applyBackgroundTint(remoteViews: RemoteViews, viewId: Int, color: Int) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      remoteViews.setColorStateList(
        viewId,
        "setBackgroundTintList",
        ColorStateList.valueOf(color),
      )
    }
  }

  private fun parseColorOrDefault(color: String?, fallback: Int): Int {
    if (color.isNullOrBlank()) {
      return fallback
    }
    return runCatching { Color.parseColor(color) }.getOrDefault(fallback)
  }
}
