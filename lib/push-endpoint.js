/**
 * Web Push endpoints are chosen by the browser, but the request can be made by anyone signed in, and the server later
 * POSTs to whatever address was stored. Without a check that is a way to make the server call internal addresses
 * (SSRF), so only the push services that browsers actually use are accepted: the address must be https, on the
 * default port, with no credentials, and its host must be (a subdomain of) one of these.
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge, Opera, Brave, Samsung Internet (Firebase Cloud Messaging)
  "push.services.mozilla.com", // Firefox (updates.push.services.mozilla.com)
  "push.apple.com", // Safari / iOS web push (web.push.apple.com)
  "notify.windows.com", // legacy Edge (WNS)
];

export function isAllowedPushEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
