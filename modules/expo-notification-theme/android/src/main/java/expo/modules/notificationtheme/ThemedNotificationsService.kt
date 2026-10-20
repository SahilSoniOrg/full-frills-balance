package expo.modules.notificationtheme

import android.app.Notification as AndroidNotification
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import expo.modules.notifications.service.interfaces.PresentationDelegate

class ThemedNotificationsService : NotificationsService() {
  override fun getPresentationDelegate(context: Context): PresentationDelegate =
    ThemedPresentationDelegate(context)
}

internal class ThemedPresentationDelegate(context: Context) : ExpoPresentationDelegate(context) {
  override suspend fun createNotification(
    notification: Notification,
    notificationBehavior: NotificationBehaviorRecord?
  ): AndroidNotification {
    val original = super.createNotification(notification, notificationBehavior)
    val content = notification.notificationRequest.content
    val data = content.body
    val type = data?.optString("type")
    if (type !in setOf("sms_transaction_needs_review", "journal_reminder", "notification_test")) {
      return original
    }

    val detailedSms = type == "sms_transaction_needs_review" &&
      data?.optBoolean("hasDetails") == true && data.optBoolean("grouped") != true
    val tone = if (detailedSms) data?.optString("notificationTone") else null
    val panel = when (tone) {
      "expense" -> R.drawable.ffb_notification_expense_panel
      "income" -> R.drawable.ffb_notification_income_panel
      else -> R.drawable.ffb_notification_neutral_panel
    }
    val icon = when (tone) {
      "expense" -> R.drawable.ffb_notification_expense
      "income" -> R.drawable.ffb_notification_income
      else -> R.drawable.ffb_notification_balance
    }
    val accent = context.getColor(when (tone) {
      "expense" -> R.color.ffb_notification_expense_ink
      "income" -> R.color.ffb_notification_income_ink
      else -> R.color.ffb_notification_brand_ink
    })
    val compact = RemoteViews(context.packageName, R.layout.ffb_notification_compact)
    val expanded = RemoteViews(context.packageName, R.layout.ffb_notification_expanded)
    for (layout in listOf(compact, expanded)) {
      layout.setInt(R.id.ffb_notification_panel, "setBackgroundResource", panel)
      layout.setImageViewResource(R.id.ffb_notification_icon, icon)
      layout.setTextViewText(R.id.ffb_notification_title, content.title)
      layout.setTextViewText(R.id.ffb_notification_body, content.text)
    }
    if (context.resources.configuration.fontScale > 1.3f) {
      compact.setViewVisibility(R.id.ffb_notification_body, View.GONE)
    }

    return AndroidNotification.Builder.recoverBuilder(context, original)
      .setColor(accent)
      .setStyle(AndroidNotification.DecoratedCustomViewStyle())
      .setCustomContentView(compact)
      .setCustomBigContentView(expanded)
      .setCustomHeadsUpContentView(compact)
      .build()
  }
}
