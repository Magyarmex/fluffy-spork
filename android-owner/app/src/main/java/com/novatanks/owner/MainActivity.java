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
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String ALLOWED_HOST = "magyarmex.github.io";
    private FrameLayout root;
    private WebView webView;
    private TextView permissionBanner;
    private View enrollmentView;
    private boolean permissionPrompted;
    private boolean bridgeInstalled;

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
        buildUi();
        registerOperationReceiver();
        if (OwnerEnrollment.isEnrolled(this)) activateOwnerSession();
        else showEnrollment();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!OwnerEnrollment.isEnrolled(this)) {
            showEnrollment();
            permissionBanner.setVisibility(View.GONE);
            return;
        }
        activateOwnerSession();
        boolean granted = notificationAccessGranted();
        permissionBanner.setVisibility(granted ? View.GONE : View.VISIBLE);
        if (!granted && !permissionPrompted) {
            permissionPrompted = true;
            Toast.makeText(this, "Enable notification access for NOVA Owner. This is the final required phone-link step.", Toast.LENGTH_LONG).show();
            permissionBanner.postDelayed(this::openNotificationAccess, 650);
        }
        if (granted) injectBridgeWrapper();
    }

    @Override
    protected void onDestroy() {
        try { unregisterReceiver(operationReceiver); } catch (Exception ignored) {}
        if (webView != null) {
            if (bridgeInstalled) webView.removeJavascriptInterface("NOVAOwnerNative");
            webView.destroy();
        }
        super.onDestroy();
    }

    private void buildUi() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(4, 6, 13));
        webView = new WebView(this);
        configureWebView(webView);
        webView.setVisibility(View.GONE);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        permissionBanner = new TextView(this);
        permissionBanner.setText("OWNER LINK OFF · TAP TO ENABLE AGENT NOTIFICATIONS");
        permissionBanner.setTextColor(Color.rgb(237, 250, 255));
        permissionBanner.setBackgroundColor(Color.argb(235, 8, 20, 34));
        permissionBanner.setGravity(Gravity.CENTER);
        permissionBanner.setTextSize(12f);
        permissionBanner.setPadding(18, 12, 18, 12);
        permissionBanner.setVisibility(View.GONE);
        permissionBanner.setOnClickListener(v -> openNotificationAccess());
        FrameLayout.LayoutParams bannerParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(permissionBanner, bannerParams);
        setContentView(root);
    }

    private void showEnrollment() {
        if (enrollmentView != null && enrollmentView.getParent() != null) return;
        webView.setVisibility(View.GONE);

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER_HORIZONTAL);
        panel.setPadding(48, 48, 48, 48);
        panel.setBackgroundColor(Color.rgb(6, 13, 25));

        TextView title = new TextView(this);
        title.setText("NOVA OWNER · ENROLL THIS PHONE");
        title.setTextColor(Color.rgb(77, 227, 255));
        title.setTextSize(18f);
        title.setGravity(Gravity.CENTER);

        TextView help = new TextView(this);
        help.setText("Paste the private Owner Enrollment code provided in ChatGPT. It is verified locally and is never transmitted.");
        help.setTextColor(Color.rgb(180, 209, 222));
        help.setTextSize(13f);
        help.setGravity(Gravity.CENTER);
        help.setPadding(0, 22, 0, 18);

        EditText code = new EditText(this);
        code.setHint("Owner Enrollment code");
        code.setSingleLine(true);
        code.setSelectAllOnFocus(true);
        code.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        code.setTextColor(Color.WHITE);
        code.setHintTextColor(Color.rgb(105, 137, 151));

        TextView error = new TextView(this);
        error.setTextColor(Color.rgb(255, 112, 139));
        error.setTextSize(12f);
        error.setGravity(Gravity.CENTER);
        error.setPadding(0, 10, 0, 4);

        Button enroll = new Button(this);
        enroll.setText("ENROLL THIS PHONE");
        enroll.setOnClickListener(v -> {
            if (!OwnerEnrollment.enroll(getApplicationContext(), code.getText().toString())) {
                error.setText("Enrollment code rejected.");
                return;
            }
            error.setText("");
            if (enrollmentView != null) root.removeView(enrollmentView);
            enrollmentView = null;
            permissionPrompted = false;
            activateOwnerSession();
            permissionBanner.setVisibility(View.VISIBLE);
            Toast.makeText(this, "Owner phone enrolled. Enable notification access to finish linking.", Toast.LENGTH_LONG).show();
            permissionBanner.postDelayed(this::openNotificationAccess, 450);
        });

        panel.addView(title, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        panel.addView(help, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        panel.addView(code, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        panel.addView(error, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        panel.addView(enroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        enrollmentView = panel;
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        params.setMargins(22, 22, 22, 22);
        root.addView(panel, params);
    }

    private void activateOwnerSession() {
        if (!OwnerEnrollment.isEnrolled(this)) return;
        if (!bridgeInstalled) {
            webView.addJavascriptInterface(new OwnerBridge(this), "NOVAOwnerNative");
            bridgeInstalled = true;
        }
        webView.setVisibility(View.VISIBLE);
        if (webView.getUrl() == null) webView.loadUrl(BuildConfig.NOVA_URL);
    }

    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
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
        if (webView == null || !OwnerEnrollment.isEnrolled(this) || !notificationAccessGranted()) return;
        String script = "(() => {" +
                "if (!window.NOVAOwnerNative) return;" +
                "let listeners = window.__novaOwnerListeners || (window.__novaOwnerListeners = new Set());" +
                "window.__novaOwnerNativeOnEvent = p => { let e; try{e=JSON.parse(p)}catch(_){return} listeners.forEach(fn=>{try{fn(e)}catch(_){}}); };" +
                "window.NOVAOwnerPhone = {" +
                "getOwnerState:()=>JSON.parse(NOVAOwnerNative.getOwnerStateJson())," +
                "getWorkItems:()=>JSON.parse(NOVAOwnerNative.getWorkItemsJson())," +
                "subscribe:(fn)=>{listeners.add(fn);return()=>listeners.delete(fn)}," +
                "openWorkItem:(id,source)=>NOVAOwnerNative.openWorkItem(String(id||''),String(source||''))" +
                "};" +
                "window.dispatchEvent(new Event('NOVA_OWNER_PHONE_READY'));" +
                "})();";
        webView.evaluateJavascript(script, null);
    }

    private void pushOperation(String json) {
        if (webView == null || !OwnerEnrollment.isEnrolled(this) || !notificationAccessGranted()) return;
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
        if (!OwnerEnrollment.isEnrolled(this)) return;
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
