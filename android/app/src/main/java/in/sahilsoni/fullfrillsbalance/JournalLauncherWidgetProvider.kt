package `in`.sahilsoni.fullfrillsbalance

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

class JournalLauncherWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    appWidgetIds.forEach { appWidgetId ->
      appWidgetManager.updateAppWidget(appWidgetId, buildRemoteViews(context))
    }
  }

  override fun onEnabled(context: Context) {
    super.onEnabled(context)
    refreshAll(context)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: android.os.Bundle
  ) {
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
    appWidgetManager.updateAppWidget(appWidgetId, buildRemoteViews(context))
  }

  companion object {
    fun refreshAll(context: Context) {
      FullFrillsBalanceWidgetSupport.refreshAll(context)
    }

    private fun buildRemoteViews(context: Context): RemoteViews {
      return RemoteViews(context.packageName, R.layout.widget_journal_launcher).apply {
        FullFrillsBalanceWidgetSupport.bindTransactionButtons(
          context = context,
          remoteViews = this,
          incomeViewId = R.id.widget_income_button,
          expenseViewId = R.id.widget_expense_button,
          transferViewId = R.id.widget_transfer_button,
        )
        FullFrillsBalanceWidgetSupport.applyLauncherTheme(
          context = context,
          remoteViews = this,
          containerViewId = R.id.widget_journal_launcher_container,
          actionIconViewIds = intArrayOf(
            R.id.widget_income_button,
            R.id.widget_expense_button,
            R.id.widget_transfer_button,
          ),
        )
      }
    }
  }
}
