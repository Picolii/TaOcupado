package com.picolii.taocupado;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeStatusPanel")
public class NativeStatusPanelPlugin extends Plugin {
    private static final int STATUS_NOTIFICATION_ID = 7001;
    private static final String CHANNEL_ID = "bathroom-status";
    private static final int COLOR_BG = Color.rgb(23, 28, 35);
    private static final int COLOR_FREE_BG = Color.rgb(17, 51, 38);
    private static final int COLOR_FREE = Color.rgb(34, 197, 94);
    private static final int COLOR_FREE_SOFT = Color.rgb(167, 243, 208);
    private static final int COLOR_BUSY_BG = Color.rgb(64, 20, 28);
    private static final int COLOR_BUSY = Color.rgb(248, 113, 113);
    private static final int COLOR_BUSY_SOFT = Color.rgb(254, 202, 202);
    private static final int COLOR_WARN_BG = Color.rgb(67, 45, 13);
    private static final int COLOR_WARN = Color.rgb(251, 146, 60);
    private static final int COLOR_WARN_SOFT = Color.rgb(254, 215, 170);

    @PluginMethod
    public void update(PluginCall call) {
        try {
            Context context = getContext();
            ensureChannel(context);

            RemoteViews collapsed = buildRemoteViews(context, call);
            RemoteViews expanded = buildRemoteViews(context, call);
            PendingIntent intent = buildContentIntent(context);
            String summary = call.getString("summary", "Status ao vivo");

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_taocupado)
                .setColor(COLOR_FREE)
                .setContentTitle("Tá Ocupado?")
                .setContentText(summary)
                .setSubText("ao vivo")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setContentIntent(intent)
                .setCustomContentView(collapsed)
                .setCustomBigContentView(expanded)
                .setStyle(new NotificationCompat.DecoratedCustomViewStyle());

            NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            manager.notify(STATUS_NOTIFICATION_ID, builder.build());
            call.resolve();
        } catch (Exception error) {
            call.reject("Não foi possível atualizar o painel nativo.", error);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        NotificationManager manager =
            (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        manager.cancel(STATUS_NOTIFICATION_ID);
        call.resolve();
    }

    private RemoteViews buildRemoteViews(Context context, PluginCall call) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.notification_status_panel);
        boolean cleaning = Boolean.TRUE.equals(call.getBoolean("cleaning", false));

        views.setTextViewText(R.id.notification_title, "Tá Ocupado?");
        views.setTextViewText(R.id.notification_subtitle, call.getString("summary", "Status ao vivo"));
        views.setInt(R.id.notification_root, "setBackgroundColor", COLOR_BG);

        JSObject stallOne = call.getObject("stallOne", new JSObject());
        JSObject stallTwo = call.getObject("stallTwo", new JSObject());
        bindStall(
            views,
            R.id.notification_stall_one_card,
            R.id.notification_stall_one_label,
            R.id.notification_stall_one_status,
            stallOne,
            cleaning
        );
        bindStall(
            views,
            R.id.notification_stall_two_card,
            R.id.notification_stall_two_label,
            R.id.notification_stall_two_status,
            stallTwo,
            cleaning
        );

        views.setTextViewText(R.id.notification_footer, call.getString("footer", "Fila vazia"));
        return views;
    }

    private void bindStall(
        RemoteViews views,
        int cardId,
        int labelId,
        int statusId,
        JSObject stall,
        boolean cleaning
    ) {
        String label = stall.getString("label", "Vaso");
        boolean occupied = Boolean.TRUE.equals(stall.getBoolean("occupied", false));
        boolean noPaper = Boolean.TRUE.equals(stall.getBoolean("noPaper", false));

        String status = cleaning ? "LIMPEZA" : occupied ? "OCUPADO" : "LIVRE";
        if (!cleaning && noPaper) status = status + " · SEM PAPEL";

        int bg = cleaning ? COLOR_WARN_BG : occupied || noPaper ? COLOR_BUSY_BG : COLOR_FREE_BG;
        int strong = cleaning ? COLOR_WARN : occupied || noPaper ? COLOR_BUSY : COLOR_FREE;
        int soft = cleaning ? COLOR_WARN_SOFT : occupied || noPaper ? COLOR_BUSY_SOFT : COLOR_FREE_SOFT;

        views.setInt(cardId, "setBackgroundColor", bg);
        views.setTextViewText(labelId, label);
        views.setTextColor(labelId, soft);
        views.setTextViewText(statusId, status);
        views.setTextColor(statusId, strong);
    }

    private void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Status do banheiro",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Painel fixo com o status dos vasos.");
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        channel.enableLights(false);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
    }

    private PendingIntent buildContentIntent(Context context) {
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent == null) launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, 0, launchIntent, flags);
    }
}
