package unisphere.devaditya.dev;

import android.net.Uri;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Capacitor's own client, plus one thing: when the page itself cannot be loaded (no connection, DNS, timeout, TLS), show the
 * bundled offline page (native-shell/offline.html) instead of Android's error screen.
 *
 * This is deliberately not Capacitor's `server.errorPath` setting: that also fires for every main-frame HTTP error, so it would
 * replace the app's own 404, 403 and maintenance (503) pages. Here only a failed connection is handled; an HTTP error is a
 * page like any other and is shown as the server sent it.
 */
public class AppWebViewClient extends BridgeWebViewClient {

    private final Bridge bridge;

    public AppWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (!request.isForMainFrame()) return;

        int code = error.getErrorCode();
        // These are about the address or a link to another app, not about the network: not a reason to show "offline".
        if (code == ERROR_UNSUPPORTED_SCHEME || code == ERROR_BAD_URL || code == ERROR_UNSUPPORTED_AUTH_SCHEME) return;

        Uri failed = request.getUrl();
        String localHost = bridge.getHost();
        if (localHost.equalsIgnoreCase(failed.getHost())) return; // the offline page itself: never loop

        // The page passes ?u= back to itself so "Try again" returns to where the member was.
        view.loadUrl(bridge.getScheme() + "://" + localHost + "/offline.html?u=" + Uri.encode(failed.toString()));
    }
}
