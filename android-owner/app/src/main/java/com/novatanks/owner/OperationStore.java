package com.novatanks.owner;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

final class OperationStore {
    private static final String PREFS = "nova_owner_operations";
    private static final String KEY = "items";
    private static final int MAX = 30;

    private OperationStore() {}

    static synchronized JSONObject record(Context context, String notificationKey, String packageName,
                                          String title, String text, long timestamp) {
        NotificationClassifier.Parsed parsed = NotificationClassifier.classify(packageName, title, text);
        if (parsed == null) return null;
        String bindingId = OwnerIdentity.bindingId();
        if (bindingId.length() < 16) return null;

        try {
            JSONObject item = new JSONObject();
            item.put("id", stableId(notificationKey, timestamp));
            item.put("bindingId", bindingId);
            item.put("source", parsed.source);
            item.put("status", parsed.status);
            item.put("actionRequired", parsed.actionRequired);
            item.put("title", chooseTitle(title, text));
            item.put("summary", chooseSummary(title, text));
            item.put("timestamp", timestamp > 0 ? timestamp : System.currentTimeMillis());

            JSONArray current = readArray(context);
            JSONArray next = new JSONArray();
            next.put(item);
            String id = item.getString("id");
            for (int i = 0; i < current.length() && next.length() < MAX; i++) {
                JSONObject old = current.optJSONObject(i);
                if (old == null || id.equals(old.optString("id"))) continue;
                next.put(old);
            }
            prefs(context).edit().putString(KEY, next.toString()).apply();
            return item;
        } catch (Exception ignored) {
            return null;
        }
    }

    static synchronized String itemsJson(Context context) {
        return readArray(context).toString();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray readArray(Context context) {
        try { return new JSONArray(prefs(context).getString(KEY, "[]")); }
        catch (Exception ignored) { return new JSONArray(); }
    }

    private static String stableId(String key, long time) {
        String raw = (key == null ? "notification" : key) + ":" + time;
        return Integer.toHexString(raw.hashCode()) + Long.toHexString(time);
    }

    private static String chooseTitle(String title, String text) {
        String t = clean(title, 84);
        String body = clean(text, 84);
        if (isGeneric(t) && !body.isEmpty()) return body;
        return !t.isEmpty() ? t : (!body.isEmpty() ? body : "Agent update");
    }

    private static String chooseSummary(String title, String text) {
        String t = clean(title, 120);
        String body = clean(text, 120);
        String chosen = chooseTitle(title, text);
        if (!body.isEmpty() && !body.equals(chosen)) return body;
        if (!t.isEmpty() && !t.equals(chosen)) return t;
        return "";
    }

    private static boolean isGeneric(String value) {
        String v = value.toLowerCase();
        return v.equals("chatgpt") || v.equals("claude") || v.equals("telegram") || v.equals("jarvis") || v.equals("hermes");
    }

    private static String clean(String value, int max) {
        if (value == null) return "";
        String result = value.replaceAll("[\\p{Cntrl}&&[^\\r\\n\\t]]", " ").replaceAll("\\s+", " ").trim();
        return result.length() <= max ? result : result.substring(0, max);
    }
}
