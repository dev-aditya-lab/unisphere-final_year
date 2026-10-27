import { readFileSync } from 'node:fs';
import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android app (docs/ANDROID_APP.md). UniSphere is a server-rendered Next.js app (server actions, cookie sessions, a request
 * proxy), so it cannot be bundled into the app as static files. The app is a native shell around the live site:
 * `server.url` is the site, `webDir` holds only the few local pages the shell needs when the site cannot be reached.
 *
 * Change the target with CAPACITOR_SERVER_URL (for example a staging site) and run `npm run native:sync`.
 */
const version: string = JSON.parse(readFileSync('./package.json', 'utf8')).version;
const serverUrl = (process.env.CAPACITOR_SERVER_URL || 'https://unispheres.in').replace(/\/+$/, '');
const debug = process.env.CAPACITOR_DEBUG === 'true';

const config: CapacitorConfig = {
  // Permanent once the app is on Google Play. Also the package in /.well-known/assetlinks.json (ANDROID_PACKAGE_NAME).
  appId: 'unisphere.devaditya.dev',
  appName: 'UniSphere',
  webDir: 'native-shell',
  server: {
    url: serverUrl,
    // Plain http is only ever for a LAN development server; production is https only.
    cleartext: serverUrl.startsWith('http://'),
    // Anything else (a payment gateway, another site) opens in the browser, not inside the app.
    allowNavigation: [new URL(serverUrl).hostname],
  },
  android: {
    // The server recognises the app by this token (lib/native-app.js): it skips the landing page and never shows the
    // blue tick purchase, because Google Play requires Play Billing for digital goods sold inside an app.
    appendUserAgent: `UniSphereApp/${version} (Android)`,
    allowMixedContent: false,
    webContentsDebuggingEnabled: debug,
    loggingBehavior: debug ? 'debug' : 'none',
  },
  plugins: {
    // A notification shown by the system while the app is closed; while it is open the in-app bell already updates live.
    PushNotifications: { presentationOptions: [] },
    // The page already draws under the system bars (viewport-fit=cover); Capacitor passes the insets through to it.
    SystemBars: { insetsHandling: 'css' },
  },
};

export default config;
