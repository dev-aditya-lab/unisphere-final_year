import "server-only";

/**
 * JSON-over-HTTPS helper for gateway adapters (server only). Every call has a hard timeout and is never cached, and a failure
 * returns a short, safe message: provider errors can echo request details, so they are logged on the server and never shown to
 * the member. `providerMessage` is for administrator screens only.
 *
 *   const res = await gatewayRequest({ tag: "mygateway", method: "POST", url, headers: { Authorization }, body: { ... } });
 *   if (!res.ok) return res;          // already shaped as an adapter failure: { ok: false, error, code, ... }
 *   res.data                          // the parsed JSON
 *
 * Pass `form` instead of `body` for gateways that expect application/x-www-form-urlencoded.
 * `describeError(json)` may return `{ code, message }` from the gateway's error body, for the log and for administrators.
 */
export async function gatewayRequest({ tag, method = "GET", url, headers = {}, body, form, describeError }) {
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return "";
    }
  })();
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: form ? new URLSearchParams(form).toString() : body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = describeError?.(json) ?? null;
      console.error(`[payments:${tag}]`, method, path, res.status, detail?.code);
      return {
        ok: false,
        error: "The payment provider could not complete that. Please try again.",
        code: "provider_error",
        status: res.status,
        providerMessage: typeof detail?.message === "string" ? detail.message.slice(0, 200) : null,
      };
    }
    return { ok: true, status: res.status, data: json };
  } catch (err) {
    console.error(`[payments:${tag}] request failed:`, method, path, err?.name);
    return { ok: false, error: "The payment provider is not reachable right now. Please try again.", code: "provider_unreachable" };
  }
}
