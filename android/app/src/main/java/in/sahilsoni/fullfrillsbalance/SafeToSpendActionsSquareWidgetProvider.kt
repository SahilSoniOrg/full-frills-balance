package `in`.sahilsoni.fullfrillsbalance // expo-inject-androidpackage

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

class SafeToSpendActionsSquareWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    appWidgetIds.forEach { appWidgetId ->
      appWidgetManager.updateAppWidget(appWidgetId, buildRemoteViews(context, appWidgetId))
    }
  }

  override fun onEnabled(context: Context) {
    super.onEnabled(context)
    FullFrillsBalanceWidgetSupport.refreshAll(context)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: android.os.Bundle,
  ) {
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
    appWidgetManager.updateAppWidget(appWidgetId, buildRemoteViews(context, appWidgetId))
  }

  companion object {
    private const val REQUEST_CODE_OPEN_APP = 2003

    private fun buildRemoteViews(context: Context, appWidgetId: Int): RemoteViews {
      return RemoteViews(context.packageName, R.layout.widget_safe_to_spend_actions_square).apply {
        FullFrillsBalanceWidgetSupport.bindSafeToSpend(
          context = context,
          remoteViews = this,
          titleViewId = R.id.widget_safe_to_spend_actions_square_title,
          amountViewId = R.id.widget_safe_to_spend_actions_square_amount,
          subtitleViewId = R.id.widget_safe_to_spend_actions_square_subtitle,
          workplaceNameViewId = R.id.widget_safe_to_spend_actions_square_workplace_name,
          appWidgetId = appWidgetId,
        )
        FullFrillsBalanceWidgetSupport.bindTransactionButtons(
          context = context,
          remoteViews = this,
          incomeViewId = R.id.widget_safe_to_spend_actions_square_income_button,
          expenseViewId = R.id.widget_safe_to_spend_actions_square_expense_button,
          transferViewId = R.id.widget_safe_to_spend_actions_square_transfer_button,
          appWidgetId = appWidgetId,
        )
        FullFrillsBalanceWidgetSupport.applySafeToSpendActionsTheme(
          context = context,
          remoteViews = this,
          rootViewId = R.id.widget_safe_to_spend_actions_square_root,
          titleViewId = R.id.widget_safe_to_spend_actions_square_title,
          amountViewId = R.id.widget_safe_to_spend_actions_square_amount,
          subtitleViewId = R.id.widget_safe_to_spend_actions_square_subtitle,
          workplaceNameViewId = R.id.widget_safe_to_spend_actions_square_workplace_name,
          actionLabelViewIds = intArrayOf(),
          actionIconViewIds = intArrayOf(
            R.id.widget_safe_to_spend_actions_square_income_button,
            R.id.widget_safe_to_spend_actions_square_expense_button,
            R.id.widget_safe_to_spend_actions_square_transfer_button,
          ),
          actionBackgroundViewIds = intArrayOf(),
        )
        FullFrillsBalanceWidgetSupport.hideDetailsWhenWidgetIsShort(
          context,
          this,
          appWidgetId,
          128,
          R.id.widget_safe_to_spend_actions_square_subtitle,
          R.id.widget_safe_to_spend_actions_square_subtitle,
        )

        setOnClickPendingIntent(
          R.id.widget_safe_to_spend_actions_square_content,
          FullFrillsBalanceWidgetSupport.createOpenAppPendingIntent(context, REQUEST_CODE_OPEN_APP, appWidgetId),
        )
      }
    }
  }
}
