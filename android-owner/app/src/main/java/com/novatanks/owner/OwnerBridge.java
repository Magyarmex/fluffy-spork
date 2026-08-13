package com.novatanks.owner;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

final class OwnerBridge {
    private final Activity activity;

    OwnerBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String getOwnerStateJson() {
        try {
            boolean enrolled = OwnerEnrollment.isEnrolled(activity.getApplicationContext());
            JSONObject state = new JSONObject();
            state.put("owner", enrolled);
            state.put("phoneBound", enrolled);
            state.put("bindingId", enrolled ? OwnerIdentity.bindingId() : "");
            state.put("capability", enrolled ? "nova.owner.operations.v1" : "");
            return state.toString();
        } catch (Exception error) {
            return "{}";
        }
    }

    @JavascriptInterface
    public String getWorkItemsJson() {
        if (!OwnerEnrollment.isEnrolled(activity.getApplicationContext())) return "[]";
        return OperationStore.itemsJson(activity.getApplicationContext());
    }

    @JavascriptInterface
    public void openWorkItem(String id, String source) {
        if (!OwnerEnrollment.isEnrolled(activity.getApplicationContext())) return;
        String pkg = packageFor(source);
        activity.runOnUiThread(() -> {
            try {
                Intent launch = activity.getPackageManager().getLaunchIntentForPackage(pkg);
                if (launch != null) {
                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    activity.startActivity(launch);
                    return;
                }
                activity.startActivity(new Intent(Intent.ACTION_VIEW,
                        Uri.parse("https://play.google.com/store/apps/details?id=" + pkg)));
            } catch (Exception ignored) {}
        });
    }

    private static String packageFor(String source) {
        if (source == null) return NotificationClassifier.OPENAI;
        switch (source.toLowerCase()) {
            case "claude": return NotificationClassifier.CLAUDE;
            case "jarvis":
            case "telegram": return NotificationClassifier.TELEGRAM;
            case "codex":
            case "chatgpt":
            default: return NotificationClassifier.OPENAI;
        }
    }
}
