package `in`.sahilsoni.fullfrillsbalance // expo-inject-androidpackage

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

class StreakPetWidgetProvider : AppWidgetProvider() {
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
    private const val REQUEST_CODE_OPEN_APP = 3001

    private fun buildRemoteViews(context: Context): RemoteViews {
      return RemoteViews(context.packageName, R.layout.widget_streak_pet).apply {
        FullFrillsBalanceWidgetSupport.bindStreakPet(
          context = context,
          remoteViews = this,
          titleViewId = R.id.widget_streak_title,
          countViewId = R.id.widget_streak_count,
          subtitleViewId = R.id.widget_streak_subtitle,
          petEmojiViewId = R.id.widget_pet_emoji,
          petHealthViewId = R.id.widget_pet_health,
        )
        FullFrillsBalanceWidgetSupport.applyStreakPetTheme(
          context = context,
          remoteViews = this,
          rootViewId = R.id.widget_streak_pet_root,
          titleViewId = R.id.widget_streak_title,
          countViewId = R.id.widget_streak_count,
          subtitleViewId = R.id.widget_streak_subtitle,
          petHealthViewId = R.id.widget_pet_health,
        )

        setOnClickPendingIntent(
          R.id.widget_streak_pet_root,
          FullFrillsBalanceWidgetSupport.createOpenAppPendingIntent(context, REQUEST_CODE_OPEN_APP),
        )
      }
    }
  }
}
