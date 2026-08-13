package com.novatanks.owner;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String ALLOWED_HOST = "magyarmex.github.io";
    private WebView webView;
    private TextView permissionBanner;
    private boolean permissionPrompted;

    private final BroadcastReceiver operationReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!NovaNotificationListener.ACTION_OPERATION.equals(intent.getAction())) return;
            String payload = intent.getStringExtra(NovaNotificationListener.EXTRA_OPERATION);
            if (payload != null) pushOperation(payload);
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        OwnerIdentity.bindingId();
        buildUi();
        registerOperationReceiver();
        webView.loadUrl(BuildConfig.NOVA_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        boolean granted = notificationAccessGranted();
        permissionBanner.setVisibility(granted ? View.GONE : View.VISIBLE);
        if (!granted && !permissionPrompted) {
            permissionPrompted = true;
            Toast.makeText(this, "Enable notification access for NOVA Owner. This is the one required pairing step.", Toast.LENGTH_LONG).show();
            permissionBanner.postDelayed(this::openNotificationAccess, 650);
        }
        if (granted) injectBridgeWrapper();
    }

    @Override
    protected void onDestroy() {
        try { unregisterReceiver(operationReceiver); } catch (Exception ignored) {}
        if (webView != null) {
            webView.removeJavascriptInterface("NOVAOwnerNative");
            webView.destroy();
        }
        super.onDestroy();
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(4, 6, 13));
        webView = new WebView(this);
        configureWebView(webView);
        webView.addJavascriptInterface(new OwnerBridge(this), "NOVAOwnerNative");
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        permissionBanner = new TextView(this);
        permissionBanner.setText("OWNER LINK OFF · TAP TO ENABLE AGENT NOTIFICATIONS");
        permissionBanner.setTextColor(Color.rgb(237, 250, 255));
        permissionBanner.setBackgroundColor(Color.argb(235, 8, 20, 34));
        permissionBanner.setGravity(Gravity.CENTER);
        permissionBanner.setTextSize(12f);
        permissionBanner.setPadding(18, 12, 18, 12);
        permissionBanner.setOnClickListener(v -> openNotificationAccess());
        FrameLayout.LayoutParams bannerParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(permissionBanner, bannerParams);
        setContentView(root);
    }

    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);

        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (request.isForMainFrame() && isCanonical(uri)) return false;
                if (request.isForMainFrame()) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                    return true;
                }
                return false;
            }

            @Override public void onPageFinished(WebView v, String url) {
                super.onPageFinished(v, url);
                if (isCanonical(Uri.parse(url))) injectBridgeWrapper();
            }
        });
    }

    private boolean isCanonical(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme()) && ALLOWED_HOST.equalsIgnoreCase(uri.getHost())
                && uri.getPath() != null && uri.getPath().startsWith("/fluffy-spork/");
    }

    private void injectBridgeWrapper() {
        if (webView == null || !notificationAccessGranted()) return;
        String script = "(() => {" +
                "if (!window.NOVAOwnerNative) return;" +
                "let listeners = window.__novaOwnerListeners || (window.__novaOwnerListeners = new Set());" +
                "window.__novaOwnerNativeOnEvent = p => { let e; try{e=JSON.parse(p)}catch(_){return} listeners.forEach(fn=>{try{fn(e)}catch(_){}}); };" +
                "window.NOVAOwnerPhone = {" +
                "getOwnerState:()=>JSON.parse(NOVAOwnerNative.getOwnerStateJson())," +
                "getWorkItems:()=>JSON.parse(NOVAOwnerNative.getWorkItemsJson())," +
                "subscribe:(fn)=>{listeners.add(fn);return()=>listeners.delete(fn)}," +
                "openWorkItem:(id,source)=>NOVAOwnerNative.openWorkItem(String(id||''),String(source||''))," +
                "signChallenge:(value)=>NOVAOwnerNative.signChallenge(String(value||''))" +
                "};" +
                "window.dispatchEvent(new Event('NOVA_OWNER_PHONE_READY'));" +
                "})();";
        webView.evaluateJavascript(script, null);
    }

    private void pushOperation(String json) {
        if (webView == null || !notificationAccessGranted()) return;
        String escaped = org.json.JSONObject.quote(json);
        webView.evaluateJavascript("window.__novaOwnerNativeOnEvent && window.__novaOwnerNativeOnEvent(" + escaped + ");", null);
    }

    private void registerOperationReceiver() {
        IntentFilter filter = new IntentFilter(NovaNotificationListener.ACTION_OPERATION);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(operationReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(operationReceiver, filter);
    }

    private boolean notificationAccessGranted() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        ComponentName component = new ComponentName(this, NovaNotificationListener.class);
        if (Build.VERSION.SDK_INT >= 27) return manager.isNotificationListenerAccessGranted(component);
        String enabled = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return enabled != null && enabled.contains(component.flattenToString());
    }

    private void openNotificationAccess() {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= 30) {
                intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
                intent.putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                        new ComponentName(this, NovaNotificationListener.class).flattenToString());
            } else {
                intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            }
            startActivity(intent);
        } catch (Exception ignored) {
            startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
    }
}
