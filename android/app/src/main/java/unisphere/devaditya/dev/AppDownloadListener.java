package unisphere.devaditya.dev;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.widget.Toast;

/**
 * Hands a file the WebView is asked to download (the "download my data" export, a file attached to a post or message, an event's
 * calendar file) to Android's DownloadManager. A WebView with no download listener does nothing at all for these.
 *
 * Only https addresses are downloaded. The sign-in cookie is sent only to the app's own host; a file on another host (the
 * media storage) is reached through a short-lived signed address and needs no cookie.
 */
public class AppDownloadListener implements DownloadListener {

    private final Context context;
    private final String appHost;

    public AppDownloadListener(Context context, String appHost) {
        this.context = context;
        this.appHost = appHost;
    }

    @Override
    public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
        Uri uri = Uri.parse(url);
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            Toast.makeText(context, R.string.download_failed, Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType).replaceAll("[\\\\/]", "_");
            DownloadManager.Request request = new DownloadManager.Request(uri);
            request.setMimeType(mimeType);
            request.addRequestHeader("User-Agent", userAgent);
            if (appHost.equalsIgnoreCase(uri.getHost())) {
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) request.addRequestHeader("Cookie", cookie);
            }
            request.setTitle(fileName);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            } else {
                // Before Android 10 the public Downloads folder needs a storage permission the app does not ask for.
                request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName);
            }
            ((DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(request);
            Toast.makeText(context, context.getString(R.string.download_started, fileName), Toast.LENGTH_SHORT).show();
        } catch (RuntimeException e) {
            Toast.makeText(context, R.string.download_failed, Toast.LENGTH_SHORT).show();
        }
    }
}
