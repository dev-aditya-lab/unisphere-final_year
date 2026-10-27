import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A fake Android phone for browser tests of the app (tests/e2e/android-app.spec.js).
 *
 * What is REAL: Capacitor's own bridge script, node_modules/@capacitor/android/.../native-bridge.js, which the app injects into every
 * page, so the page's plugin calls go through exactly the code a phone runs (this is what once hung on `then`).
 * What is FAKE: the Java side. `window.androidBridge` answers each call the way the plugin would, using the state below.
 *
 * Use: `const phone = await installFakeAndroid(context, { permission: "prompt" })`, then `phone.calls(page)`, `phone.fire(page, ...)`.
 */
export const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UP1A.231105.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.122 Mobile Safari/537.36 UniSphereApp/2.6.0 (Android)";

const BRIDGE = readFileSync(path.join(process.cwd(), "node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js"), "utf8");

// The methods each plugin exposes natively (what JSExport.getPluginJS writes into window.Capacitor.PluginHeaders). Every plugin also has
// the Plugin base class's methods: addListener and removeListener are type "none" (the phone never answers them), the rest are promises.
const promise = (...names) => names.map((name) => ({ name, rtype: "promise" }));
const plugin = (name, ...methods) => ({
  name,
  methods: [...promise(...methods, "checkPermissions", "requestPermissions", "removeAllListeners"), { name: "addListener", rtype: "none" }, { name: "removeListener", rtype: "none" }],
});
const HEADERS = [
  plugin("PushNotifications", "register", "unregister", "createChannel", "listChannels", "deleteChannel", "getDeliveredNotifications", "removeDeliveredNotifications", "removeAllDeliveredNotifications"),
  plugin("App", "getLaunchUrl", "getInfo", "getState", "exitApp", "minimizeApp"),
  plugin("SystemBars", "setStyle", "show", "hide", "setAnimation"),
  plugin("Haptics", "impact", "vibrate", "selectionStart", "selectionChanged", "selectionEnd"),
  plugin("NativeSettings", "openAndroid", "openIOS"),
];

/** The page-side half: the bridge Java would have attached, then the real Capacitor bridge script, then the plugin headers. */
const phoneScript = (config, serverUrl) => `
(() => {
  const config = ${JSON.stringify(config)};
  const state = (window.__phone = { permission: config.permission, askResult: config.askResult, token: config.token, launchUrl: config.launchUrl, calls: [], listeners: {} });
  const answer = (message, data, error) => setTimeout(() => window.androidBridge.onmessage({ data: JSON.stringify({ callbackId: message.callbackId, pluginId: message.pluginId, methodName: message.methodName, success: !error, data: data ?? {}, error }) }), 5);
  state.fire = (plugin, event, data) => (state.listeners[plugin + ":" + event] || []).forEach((callbackId) =>
    window.androidBridge.onmessage({ data: JSON.stringify({ callbackId, pluginId: plugin, methodName: "addListener", success: true, data }) }));
  window.androidBridge = {
    postMessage(raw) {
      const m = JSON.parse(raw);
      const id = m.pluginId + "." + m.methodName;
      state.calls.push({ id, options: m.options });
      if (m.methodName === "addListener") {
        (state.listeners[m.pluginId + ":" + m.options.eventName] ||= []).push(m.callbackId);
        return; // a listener is answered later, by events
      }
      if (m.methodName === "removeListener") {
        const key = m.pluginId + ":" + m.options.eventName;
        state.listeners[key] = (state.listeners[key] || []).filter((callbackId) => callbackId !== m.options.callbackId);
        return; // the phone never answers this one
      }
      switch (id) {
        case "PushNotifications.checkPermissions": return answer(m, { receive: state.permission });
        case "PushNotifications.requestPermissions": state.permission = state.askResult; return answer(m, { receive: state.permission });
        case "PushNotifications.register":
          answer(m, {});
          if (state.permission === "granted") setTimeout(() => state.fire("PushNotifications", "registration", { value: state.token }), 30);
          return;
        case "App.getLaunchUrl": return answer(m, state.launchUrl ? { url: state.launchUrl } : {});
        default: return answer(m, {});
      }
    },
  };
  window.WEBVIEW_SERVER_URL = ${JSON.stringify(serverUrl)};
})();
${BRIDGE}
window.Capacitor.PluginHeaders = ${JSON.stringify(HEADERS)};
`;

/**
 * Makes every page in the browser context behave as inside the app. `serverUrl` is the site's address. Returns helpers to look at
 * what the page asked the phone to do and to make the phone do something (a tap on a notification, the back button).
 */
export async function installFakeAndroid(context, { serverUrl = "http://localhost:3100", permission = "prompt", askResult = "granted", token = "f3Gh-_9:APA91bHnqzXyKq0aYy2Jt8vVwq0tYy9a0r1Tt3Yp5cQ_x8LmN0pQ2", launchUrl = null } = {}) {
  await context.addInitScript({ content: phoneScript({ permission, askResult, token, launchUrl }, serverUrl) });
  return {
    token,
    /** Every call the page made to the phone so far: [{ id: "PushNotifications.register", options }]. */
    calls: (page) => page.evaluate(() => window.__phone.calls),
    callIds: async (page) => (await page.evaluate(() => window.__phone.calls)).map((c) => c.id),
    /** The phone sends an event to the page, as the plugin would (a notification was tapped, the back button was pressed). */
    fire: (page, plugin, event, data = {}) => page.evaluate(([p, e, d]) => window.__phone.fire(p, e, d), [plugin, event, data]),
    /** What Android answers from now on (for example "denied" after the member refused twice). */
    setPermission: (page, value) => page.evaluate((v) => void (window.__phone.permission = v), value),
  };
}
