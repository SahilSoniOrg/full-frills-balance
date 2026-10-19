package in.sahilsoni.ffbnotificationpreview;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.widget.RemoteViews;
import android.widget.TextView;

public class MainActivity extends Activity {
    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        TextView label = new TextView(this);
        label.setText("Full Frills Balance\nNative notification design preview\n\nOpen the notification shade to see the samples.\nThese are sample transactions.");
        label.setTextSize(20);
        label.setPadding(30, 100, 30, 30);
        setContentView(label);
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel("preview", "Design previews", NotificationManager.IMPORTANCE_DEFAULT));
        manager.cancelAll();
        boolean standard = getIntent().getBooleanExtra("standard", false);
        post(manager, 1, false, standard);
        post(manager, 2, true, standard);
    }

    private void post(NotificationManager manager, int identifier, boolean income, boolean standard) {
        String amount = income ? "₹48,000 received" : "₹200 spent";
        String merchant = income ? "Salary" : "Cafe Noon";
        String details = income ? "ICICI Bank · Income" : "HDFC Bank · Food & drinks";
        PendingIntent action = PendingIntent.getActivity(this, identifier, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = new Notification.Builder(this, "preview")
            .setSmallIcon(R.drawable.notification_icon)
            .setColor(Color.parseColor("#16734C"))
            .setContentTitle(amount)
            .setContentText(merchant + " · " + details)
            .setContentIntent(action)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false);
        if (standard) {
            builder.setStyle(new Notification.BigTextStyle().bigText(merchant + " · " + details + "\nTap to review and log."));
        } else {
            RemoteViews compact = new RemoteViews(getPackageName(), R.layout.notification_collapsed);
            RemoteViews expanded = new RemoteViews(getPackageName(), R.layout.notification_expanded);
            for (RemoteViews view : new RemoteViews[] {compact, expanded}) {
                view.setTextViewText(R.id.amount, amount);
                view.setTextViewText(R.id.merchant, merchant);
                view.setTextViewText(R.id.direction, income ? "↙" : "↗");
                view.setTextColor(R.id.direction, getColor(income ? R.color.preview_mint : R.color.preview_coral));
            }
            expanded.setTextViewText(R.id.details, details);
            expanded.setInt(R.id.panel, "setBackgroundResource", income ? R.drawable.income_panel : R.drawable.expense_panel);
            builder.setStyle(new Notification.DecoratedCustomViewStyle())
                .setCustomContentView(compact)
                .setCustomBigContentView(expanded)
                .addAction(new Notification.Action.Builder(null, "Review transaction", action).build());
        }
        manager.notify(identifier, builder.build());
    }
}
