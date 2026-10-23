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
import android.text.format.DateUtils
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject

data class SafeToSpendWidgetSnapshot(
  val amount: Double,
  val currencyCode: String,
  val formattedAmount: String,
  val title: String,
  val subtitle: String,
  val updatedAt: Long,
  val workplaceName: String,
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
  private const val KEY_THEME_TITLE_COLOR = "widget_theme_title_color"
  private const val KEY_THEME_PRIMARY_TEXT_COLOR = "widget_theme_primary_text_color"
  private const val KEY_THEME_SECONDARY_TEXT_COLOR = "widget_theme_secondary_text_color"
  private const val KEY_THEME_ACTION_ICON_COLOR = "widget_theme_action_icon_color"
  private const val KEY_THEME_INCOME_ACCENT_COLOR = "widget_theme_income_accent_color"
  private const val KEY_THEME_EXPENSE_ACCENT_COLOR = "widget_theme_expense_accent_color"
  private const val KEY_THEME_TRANSFER_ACCENT_COLOR = "widget_theme_transfer_accent_color"
  private const val KEY_IS_PRIVACY_ENABLED = "widget_is_privacy_enabled"
  private const val STALE_AFTER_MS = 24L * 60L * 60L * 1000L
  private const val APP_SCHEME = "fullfrillsbalance" // expo-inject-appscheme
  private const val APP_HOME_DEEP_LINK = "$APP_SCHEME://widget?source=widget"
  private const val INCOME_DEEP_LINK = "$APP_SCHEME://journal-entry?mode=simple&type=income&source=widget"
  private const val EXPENSE_DEEP_LINK = "$APP_SCHEME://journal-entry?mode=simple&type=expense&source=widget"
  private const val TRANSFER_DEEP_LINK = "$APP_SCHEME://journal-entry?mode=simple&type=transfer&source=widget"

  fun readSafeToSpendSnapshot(context: Context, appWidgetId: Int? = null): SafeToSpendWidgetSnapshot? {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val workplaceId = resolveWidgetWorkplaceId(context, appWidgetId)
    val storedSnapshot = workplaceId?.let {
      JSONObject(prefs.getString(KEY_SAFE_TO_SPEND_BY_WORKPLACE, "{}") ?: "{}").optJSONObject(it)
    }
    val workplaceName = resolveWidgetWorkplaceName(context, appWidgetId).orEmpty()

    if (storedSnapshot != null) {
      return SafeToSpendWidgetSnapshot(
        amount = storedSnapshot.optDouble("amount"),
        currencyCode = storedSnapshot.optString("currencyCode"),
        formattedAmount = storedSnapshot.optString("formattedAmount"),
        title = storedSnapshot.optString("title", context.getString(R.string.safe_to_spend_widget_title)),
        subtitle = storedSnapshot.optString("subtitle", context.getString(R.string.safe_to_spend_widget_subtitle)),
        updatedAt = storedSnapshot.optLong("updatedAt"),
        workplaceName = workplaceName,
      )
    }

    if (workplaceId != null) return null
    val formattedAmount = prefs.getString(KEY_SAFE_TO_SPEND_FORMATTED_AMOUNT, null) ?: return null
    return SafeToSpendWidgetSnapshot(
      amount = prefs.getFloat(KEY_SAFE_TO_SPEND_AMOUNT, 0f).toDouble(),
      currencyCode = prefs.getString(KEY_SAFE_TO_SPEND_CURRENCY, "") ?: "",
      formattedAmount = formattedAmount,
      title = prefs.getString(KEY_SAFE_TO_SPEND_TITLE, context.getString(R.string.safe_to_spend_widget_title)) ?: "",
      subtitle = prefs.getString(KEY_SAFE_TO_SPEND_SUBTITLE, context.getString(R.string.safe_to_spend_widget_subtitle))
        ?: "",
      updatedAt = prefs.getLong(KEY_SAFE_TO_SPEND_UPDATED_AT, 0L),
      workplaceName = "",
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
    workplaceNameViewId: Int? = null,
    appWidgetId: Int? = null,
  ) {
    val snapshot = readSafeToSpendSnapshot(context, appWidgetId)
    if (snapshot == null) {
      val workplaceName = resolveWidgetWorkplaceName(context, appWidgetId).orEmpty()
      bindWorkplaceName(remoteViews, workplaceNameViewId, workplaceName)
      remoteViews.setTextViewText(titleViewId, context.getString(R.string.safe_to_spend_widget_title))
      remoteViews.setTextViewText(amountViewId, context.getString(R.string.safe_to_spend_widget_amount_placeholder))
      remoteViews.setTextViewText(subtitleViewId, context.getString(R.string.safe_to_spend_widget_loading))
      updatedAtViewId?.let { remoteViews.setViewVisibility(it, View.GONE) }
      return
    }

    bindWorkplaceName(remoteViews, workplaceNameViewId, snapshot.workplaceName)
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val isPrivacyEnabled = prefs.getBoolean(KEY_IS_PRIVACY_ENABLED, false)
    val displayAmount = if (isPrivacyEnabled) "****" else snapshot.formattedAmount
    val isStale = snapshot.updatedAt > 0L && System.currentTimeMillis() - snapshot.updatedAt > STALE_AFTER_MS

    remoteViews.setTextViewText(
      titleViewId,
      snapshot.title.ifBlank { context.getString(R.string.safe_to_spend_widget_title) },
    )
    remoteViews.setTextViewText(amountViewId, displayAmount)
    remoteViews.setTextViewText(
      subtitleViewId,
      if (isStale) context.getString(R.string.safe_to_spend_widget_stale) else snapshot.subtitle,
    )
    updatedAtViewId?.let { viewId ->
      if (snapshot.updatedAt > 0L && !isPrivacyEnabled) {
        val updatedAt = DateUtils.getRelativeTimeSpanString(
          snapshot.updatedAt,
          System.currentTimeMillis(),
          DateUtils.MINUTE_IN_MILLIS,
        )
        remoteViews.setTextViewText(
          viewId,
          context.getString(R.string.safe_to_spend_widget_updated_at, updatedAt),
        )
        remoteViews.setViewVisibility(viewId, View.VISIBLE)
      } else {
        remoteViews.setViewVisibility(viewId, View.GONE)
      }
    }
  }

  private fun bindWorkplaceName(remoteViews: RemoteViews, viewId: Int?, workplaceName: String) {
    viewId?.let {
      if (workplaceName.isBlank()) {
        remoteViews.setViewVisibility(it, View.GONE)
      } else {
        remoteViews.setTextViewText(it, workplaceName)
        remoteViews.setViewVisibility(it, View.VISIBLE)
      }
    }
  }

  fun hideDetailsWhenWidgetIsShort(
    context: Context,
    remoteViews: RemoteViews,
    appWidgetId: Int,
    minHeightDp: Int,
    keepVisibleWhenStaleViewId: Int?,
    vararg viewIds: Int,
  ) {
    val height = AppWidgetManager.getInstance(context)
      .getAppWidgetOptions(appWidgetId)
      .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)
    val isStale = readSafeToSpendSnapshot(context, appWidgetId)?.updatedAt?.let { updatedAt ->
      updatedAt > 0L && System.currentTimeMillis() - updatedAt > STALE_AFTER_MS
    } == true
    viewIds.forEach { viewId ->
      val hideView = height in 1 until minHeightDp && !(isStale && viewId == keepVisibleWhenStaleViewId)
      remoteViews.setViewVisibility(viewId, if (hideView) View.GONE else View.VISIBLE)
    }
  }

  fun applySafeToSpendTheme(
    context: Context,
    remoteViews: RemoteViews,
    rootViewId: Int,
    titleViewId: Int,
    amountViewId: Int,
    subtitleViewId: Int,
    workplaceNameViewId: Int? = null,
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
    workplaceNameViewId?.let {
      remoteViews.setTextColor(it, theme?.secondaryTextColor ?: Color.parseColor("#D9EAF6"))
    }
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
    workplaceNameViewId: Int? = null,
  ) {
    val theme = readThemeSnapshot(context)
    applySafeToSpendTheme(
      context = context,
      remoteViews = remoteViews,
      rootViewId = rootViewId,
      titleViewId = titleViewId,
      amountViewId = amountViewId,
      subtitleViewId = subtitleViewId,
      workplaceNameViewId = workplaceNameViewId,
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
    appWidgetId: Int? = null,
  ) {
    val workplaceName = resolveWidgetWorkplaceName(context, appWidgetId)
    fun setActionDescription(viewId: Int, labelId: Int) {
      val label = context.getString(labelId)
      val description = workplaceName?.let {
        context.getString(R.string.journal_widget_action_for_workplace, label, it)
      } ?: label
      remoteViews.setContentDescription(viewId, description)
    }

    setActionDescription(incomeViewId, R.string.journal_widget_income)
    setActionDescription(expenseViewId, R.string.journal_widget_expense)
    setActionDescription(transferViewId, R.string.journal_widget_transfer)
    remoteViews.setOnClickPendingIntent(
      incomeViewId,
      createLaunchPendingIntent(context, 1001, INCOME_DEEP_LINK, appWidgetId),
    )
    remoteViews.setOnClickPendingIntent(
      expenseViewId,
      createLaunchPendingIntent(context, 1002, EXPENSE_DEEP_LINK, appWidgetId),
    )
    remoteViews.setOnClickPendingIntent(
      transferViewId,
      createLaunchPendingIntent(context, 1003, TRANSFER_DEEP_LINK, appWidgetId),
    )
  }

  fun createOpenAppPendingIntent(context: Context, requestCode: Int, appWidgetId: Int? = null): PendingIntent {
    return createLaunchPendingIntent(context, requestCode, APP_HOME_DEEP_LINK, appWidgetId)
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
    appWidgetId: Int? = null,
  ): PendingIntent {
    val workplaceId = resolveWidgetWorkplaceId(context, appWidgetId)
    val launchUri = Uri.parse(deepLink).buildUpon().apply {
      if (!workplaceId.isNullOrBlank()) appendQueryParameter("workplaceId", workplaceId)
    }.build()
    return PendingIntent.getActivity(
      context,
      requestCode,
      Intent(Intent.ACTION_VIEW, launchUri, context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun resolveWidgetWorkplaceId(context: Context, appWidgetId: Int? = null): String? {
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val configuredWorkplaceId = appWidgetId?.let {
      prefs.getString("$KEY_WIDGET_WORKPLACE_PREFIX$it", null)
    }
    val activeWorkplaceId = prefs.getString(KEY_ACTIVE_WORKPLACE_ID, null)
    val candidate = configuredWorkplaceId ?: activeWorkplaceId
    if (candidate.isNullOrBlank()) return null

    val catalog = JSONArray(prefs.getString(KEY_WORKPLACE_CATALOG, "[]") ?: "[]")
    if (catalog.length() == 0) return candidate
    val validIds = (0 until catalog.length()).mapNotNull { index ->
      catalog.optJSONObject(index)?.optString("id")?.takeIf(String::isNotBlank)
    }.toSet()
    if (candidate in validIds) return candidate
    return activeWorkplaceId?.takeIf { it in validIds }
  }

  private fun resolveWidgetWorkplaceName(context: Context, appWidgetId: Int? = null): String? {
    val workplaceId = resolveWidgetWorkplaceId(context, appWidgetId) ?: return null
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val catalog = JSONArray(prefs.getString(KEY_WORKPLACE_CATALOG, "[]") ?: "[]")
    return (0 until catalog.length())
      .mapNotNull { index -> catalog.optJSONObject(index) }
      .firstOrNull { it.optString("id") == workplaceId }
      ?.optString("name")
      ?.takeIf(String::isNotBlank)
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
