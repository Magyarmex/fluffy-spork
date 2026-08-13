package com.novatanks.owner;

import android.app.Notification;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONObject;

public final class NovaNotificationListener extends NotificationListenerService {
    static final String ACTION_OPERATION = "com.novatanks.owner.OPERATION";
    static final String EXTRA_OPERATION = "operation";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;
        Bundle extras = sbn.getNotification().extras;
        String title = extras == null ? "" : String.valueOf(extras.getCharSequence(Notification.EXTRA_TITLE, ""));
        String text = extras == null ? "" : String.valueOf(extras.getCharSequence(Notification.EXTRA_TEXT, ""));
        if (text.isEmpty() && extras != null) {
            CharSequence big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT, "");
            if (big != null) text = big.toString();
        }

        JSONObject item = OperationStore.record(
                getApplicationContext(), sbn.getKey(), sbn.getPackageName(), title, text, sbn.getPostTime());
        if (item == null) return;

        Intent intent = new Intent(ACTION_OPERATION);
        intent.setPackage(getPackageName());
        intent.putExtra(EXTRA_OPERATION, item.toString());
        sendBroadcast(intent);
    }
}
