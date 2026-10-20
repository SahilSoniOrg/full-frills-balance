package expo.modules.notificationtheme

import android.app.Notification as AndroidNotification
import android.content.Context
import android.util.TypedValue
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
    val panelAccent = context.getColor(when (tone) {
      "expense" -> R.color.ffb_notification_expense_on_panel
      "income" -> R.color.ffb_notification_income_on_panel
      else -> R.color.ffb_notification_brand_on_panel
    })
    val suffix = when (tone) {
      "expense" -> " spent"
      "income" -> " received"
      else -> ""
    }
    val title = content.title.orEmpty()
    val separateAmount = detailedSms && suffix.isNotEmpty() && title.endsWith(suffix)
    val body = content.text.orEmpty()
    val displayBody = if (detailedSms) {
      body.removeSuffix("Tap to review and log.").trimEnd()
    } else {
      body
    }
    val compact = RemoteViews(context.packageName, R.layout.ffb_notification_compact)
    val expanded = RemoteViews(context.packageName, R.layout.ffb_notification_expanded)
    for (layout in listOf(compact, expanded)) {
      layout.setInt(R.id.ffb_notification_panel, "setBackgroundResource", panel)
      layout.setImageViewResource(R.id.ffb_notification_icon, icon)
      layout.setTextViewText(R.id.ffb_notification_title, content.title)
      layout.setTextViewText(R.id.ffb_notification_body, displayBody)
      if (displayBody.isEmpty()) {
        layout.setViewVisibility(R.id.ffb_notification_body, View.GONE)
      }
    }
    expanded.setTextViewText(
      R.id.ffb_notification_title,
      if (separateAmount) title.removeSuffix(suffix) else title
    )
    expanded.setTextViewTextSize(
      R.id.ffb_notification_title, TypedValue.COMPLEX_UNIT_SP,
      if (separateAmount && context.resources.configuration.fontScale <= 1.3f) 32f
      else if (separateAmount) 24f else 20f
    )
    expanded.setViewVisibility(
      R.id.ffb_notification_heading,
      if (separateAmount) View.VISIBLE else View.GONE
    )
    expanded.setTextViewText(
      R.id.ffb_notification_direction,
      context.getString(if (tone == "expense") R.string.ffb_notification_spent else R.string.ffb_notification_received)
    )
    expanded.setTextColor(R.id.ffb_notification_direction, panelAccent)
    if (detailedSms && displayBody.isNotEmpty()) {
      val details = displayBody.split(" · ", limit = 2)
      expanded.setTextViewText(R.id.ffb_notification_body, details.first())
      expanded.setTextViewTextSize(R.id.ffb_notification_body, TypedValue.COMPLEX_UNIT_SP, 16f)
      expanded.setTextColor(R.id.ffb_notification_body, context.getColor(R.color.ffb_notification_panel_text))
      expanded.setInt(R.id.ffb_notification_body, "setMaxLines", 1)
      details.getOrNull(1)?.takeIf { it.isNotEmpty() }?.let { metadata ->
        expanded.setTextViewText(R.id.ffb_notification_metadata, metadata)
        expanded.setViewVisibility(R.id.ffb_notification_metadata, View.VISIBLE)
      }
    }
    if (context.resources.configuration.fontScale > 1.3f) {
      compact.setViewVisibility(R.id.ffb_notification_body, View.GONE)
    }

    val builder = AndroidNotification.Builder.recoverBuilder(context, original)
      .setSmallIcon(R.drawable.ffb_notification_small_icon)
      .setColor(accent)
      .setStyle(AndroidNotification.DecoratedCustomViewStyle())
      .setCustomContentView(compact)
      .setCustomBigContentView(expanded)
      .setCustomHeadsUpContentView(compact)
    if (type == "sms_transaction_needs_review" && original.contentIntent != null && original.actions.isNullOrEmpty()) {
      val actionLabel = if (data?.optBoolean("grouped") == true) {
        R.string.ffb_notification_open_inbox
      } else {
        R.string.ffb_notification_review
      }
      builder.addAction(
        AndroidNotification.Action.Builder(null, context.getString(actionLabel), original.contentIntent).build()
      )
    }
    return builder.build()
  }
}
