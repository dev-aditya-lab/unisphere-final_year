package unisphere.devaditya.dev;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * The native shell around the live site (see capacitor.config.ts). What it adds to Capacitor's defaults:
 *  - holds the splash until the first page has painted (at most {@link #SPLASH_MAX_MS}), then shows a small loading view if the
 *    site is slow to answer (a sleeping server can take about a minute), instead of a blank screen;
 *  - shows a local offline page when the site cannot be reached ({@link AppWebViewClient});
 *  - downloads files (data export, attachments, calendar files), which a bare WebView silently ignores ({@link AppDownloadListener});
 *  - keeps the app alive when the WebView's renderer process dies, and writes cookies to disk when the app leaves the
 *    screen, so a member is still signed in after the system closes the app.
 */
public class MainActivity extends BridgeActivity {

    private static final long SPLASH_MAX_MS = 2500;
    private static final long LOADING_VIEW_AFTER_MS = 2500;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private volatile boolean firstPageShown = false;
    private FrameLayout loadingView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must run before super.onCreate: it swaps the launch theme for the app theme.
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        final long deadline = SystemClock.uptimeMillis() + SPLASH_MAX_MS;
        splash.setKeepOnScreenCondition(() -> !firstPageShown && SystemClock.uptimeMillis() < deadline);

        super.onCreate(savedInstanceState);

        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) return; // no WebView on this device: Capacitor shows its own message
        WebView webView = bridge.getWebView();

        // The window colour already matches the theme; the WebView would otherwise be white until its first paint.
        webView.setBackgroundColor(ContextCompat.getColor(this, R.color.app_background));
        bridge.setWebViewClient(new AppWebViewClient(bridge));
        webView.setDownloadListener(new AppDownloadListener(this, getString(R.string.app_link_host)));
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                markFirstPageShown();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // Returning false would let Android kill the whole app. The old WebView is unusable, so start over with a new one.
                runOnUiThread(MainActivity.this::recreate);
                return true;
            }
        });

        handler.postDelayed(this::showLoadingView, LOADING_VIEW_AFTER_MS);
    }

    @Override
    public void onPause() {
        super.onPause();
        // Android writes cookies to disk lazily; without this a sign-in can be lost when the system closes the app.
        CookieManager.getInstance().flush();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private void markFirstPageShown() {
        firstPageShown = true;
        runOnUiThread(() -> {
            if (loadingView != null && loadingView.getParent() instanceof ViewGroup) {
                ((ViewGroup) loadingView.getParent()).removeView(loadingView);
            }
            loadingView = null;
        });
    }

    /** A plain spinner and one line of text on the app's background, drawn over the (still empty) WebView. */
    private void showLoadingView() {
        if (firstPageShown || isFinishing() || isDestroyed()) return;

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);

        ProgressBar bar = new ProgressBar(this);
        bar.setIndeterminate(true);
        bar.getIndeterminateDrawable().setTint(ContextCompat.getColor(this, R.color.app_accent));
        box.addView(bar);

        TextView label = new TextView(this);
        label.setText(R.string.loading_waking);
        label.setTextSize(15);
        label.setTextColor(ContextCompat.getColor(this, R.color.app_muted));
        label.setPadding(0, (int) (16 * getResources().getDisplayMetrics().density), 0, 0);
        box.addView(label);

        FrameLayout view = new FrameLayout(this);
        view.setBackgroundColor(ContextCompat.getColor(this, R.color.app_background));
        view.addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        addContentView(view, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        loadingView = view;
    }
}
