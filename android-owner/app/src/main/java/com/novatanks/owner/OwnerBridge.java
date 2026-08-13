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
            JSONObject state = new JSONObject();
            state.put("owner", true);
            state.put("phoneBound", true);
            state.put("bindingId", OwnerIdentity.bindingId());
            state.put("capability", "nova.owner.operations.v1");
            return state.toString();
        } catch (Exception error) {
            return "{}";
        }
    }

    @JavascriptInterface
    public String getWorkItemsJson() {
        return OperationStore.itemsJson(activity.getApplicationContext());
    }

    @JavascriptInterface
    public String signChallenge(String challenge) {
        return OwnerIdentity.signChallenge(challenge == null ? "" : challenge);
    }

    @JavascriptInterface
    public void openWorkItem(String id, String source) {
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
