package `in`.sahilsoni.fullfrillsbalance // expo-inject-androidpackage

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

class SmsTriageWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    appWidgetIds.forEach { appWidgetId ->
      appWidgetManager.updateAppWidget(appWidgetId, buildRemoteViews(context))
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
    appWidgetManager.updateAppWidget(appWidgetId, buildRemoteViews(context))
  }

  companion object {
    private const val REQUEST_CODE_OPEN_INBOX = 4001

    private fun buildRemoteViews(context: Context): RemoteViews {
      return RemoteViews(context.packageName, R.layout.widget_sms_triage).apply {
        FullFrillsBalanceWidgetSupport.bindSmsTriage(
          context = context,
          remoteViews = this,
          titleViewId = R.id.widget_sms_triage_title,
          countViewId = R.id.widget_sms_triage_count,
          previewViewId = R.id.widget_sms_triage_preview,
        )
        FullFrillsBalanceWidgetSupport.applySmsTriageTheme(
          context = context,
          remoteViews = this,
          rootViewId = R.id.widget_sms_triage_root,
          titleViewId = R.id.widget_sms_triage_title,
          countViewId = R.id.widget_sms_triage_count,
          previewViewId = R.id.widget_sms_triage_preview,
        )

        setOnClickPendingIntent(
          R.id.widget_sms_triage_root,
          FullFrillsBalanceWidgetSupport.createOpenInboxPendingIntent(context, REQUEST_CODE_OPEN_INBOX),
        )
      }
    }
  }
}
