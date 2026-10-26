import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env-public", () => ({ publicEnv: { appUrl: "https://unispheres.in" } }));
const payu = (await import("@/lib/payments/gateways/payu")).default;
const { requestHash, responseHashes, verifyResponseHash } = await import("@/lib/payments/gateways/payu");

const sha = (s) => createHash("sha512").update(s).digest("hex");
const KEY = "gtKFFx";
const SALT = "eCwWELxi";
const cfg = { keyId: KEY, keySecret: SALT, webhookSecret: undefined, baseUrl: undefined };
const testCfg = { ...cfg, baseUrl: "https://test.payu.in" };

const reply = (...bodies) => {
  const fn = vi.fn();
  for (const b of bodies) fn.mockResolvedValueOnce({ ok: true, status: 200, json: async () => b });
  return fn;
};
const sentForm = (fetchMock, call = 0) => Object.fromEntries(new URLSearchParams(fetchMock.mock.calls[call][1].body));

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PayU hashes, written out literally from PayU's documented formulas", () => {
  const pipes = (n) => "|".repeat(n);

  it("request hash: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT", () => {
    const f = { key: KEY, txnid: "bt1", amount: "99.00", productinfo: "Tick", firstname: "Asha", email: "a@x.test", udf1: "ref1" };
    // udf1 = ref1, udf2..udf5 empty: 4 separators between them, then the 6 after udf5
    expect(requestHash(f, SALT)).toBe(sha(`${KEY}|bt1|99.00|Tick|Asha|a@x.test|ref1${pipes(10)}${SALT}`));
    // PayU's own count: with no udf at all there are 11 pipes between the email and the salt
    expect(requestHash({ ...f, udf1: undefined }, SALT)).toBe(sha(`${KEY}|bt1|99.00|Tick|Asha|a@x.test${pipes(11)}${SALT}`));
  });

  it("response hash: SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key", () => {
    const p = { status: "success", udf1: "ref1", email: "a@x.test", firstname: "Asha", productinfo: "Tick", amount: "99.00", txnid: "bt1", key: KEY };
    // 6 pipes after the status, then udf5..udf2 empty (4 more separators) before udf1
    expect(responseHashes(p, SALT)).toEqual([sha(`${SALT}|success${pipes(10)}ref1|a@x.test|Asha|Tick|99.00|bt1|${KEY}`)]);
    expect(responseHashes({ ...p, udf1: undefined }, SALT)).toEqual([sha(`${SALT}|success${pipes(11)}a@x.test|Asha|Tick|99.00|bt1|${KEY}`)]);
  });

  it("response hash with additional charges adds them in front, and either spelling of the field is understood", () => {
    const p = { status: "success", email: "e", firstname: "f", productinfo: "p", amount: "1.00", txnid: "t", key: KEY, additionalCharges: "2.50" };
    const base = `${SALT}|success${pipes(11)}e|f|p|1.00|t|${KEY}`;
    // both are accepted: PayU may or may not have included the charges when it signed
    expect(responseHashes(p, SALT)).toEqual([sha(`2.50|${base}`), sha(base)]);
    expect(responseHashes({ ...p, additionalCharges: undefined, additional_charges: "2.50" }, SALT)[0]).toBe(sha(`2.50|${base}`));
  });

  it("verifies a response only with the right salt, and rejects missing, short or tampered hashes", () => {
    const p = { status: "success", email: "e", firstname: "f", productinfo: "p", amount: "99.00", txnid: "bt1", key: KEY };
    const signed = { ...p, hash: responseHashes(p, SALT)[0] };
    expect(verifyResponseHash(signed, SALT)).toBe(true);
    expect(verifyResponseHash({ ...signed, hash: signed.hash.toUpperCase() }, SALT)).toBe(true);
    expect(verifyResponseHash(signed, "otherSalt")).toBe(false);
    expect(verifyResponseHash({ ...signed, amount: "1.00" }, SALT)).toBe(false);
    expect(verifyResponseHash({ ...signed, status: "failure" }, SALT)).toBe(false);
    for (const hash of [undefined, "", "abc", 42, `${signed.hash}0`]) expect(verifyResponseHash({ ...p, hash }, SALT), String(hash)).toBe(false);
    expect(verifyResponseHash(signed, "")).toBe(false);
  });
});

describe("creating an order", () => {
  const input = { amountPaise: 9900, currency: "INR", reference: "bt_0123456789abcdef0123456789abcdef", description: "UniSphere blue tick (one-time payment)", returnUrl: "https://unispheres.in/api/payments/return?o=0f8fad5b-d9cb-469f-a165-70867728950e", customer: { id: "u", name: "Asha Rao", email: "asha@example.com" } };

  it("builds a signed form for PayU's live payment page, with a txnid that fits PayU's limit", async () => {
    const res = await payu.createOrder(cfg, input);
    expect(res.ok).toBe(true);
    expect(res.orderId).toBe("bt0123456789abcdef0123456");
    expect(res.orderId.length).toBeLessThanOrEqual(25);
    expect(res.checkout).toMatchObject({ type: "form", action: "https://secure.payu.in/_payment", method: "POST" });
    const f = res.checkout.fields;
    expect(f).toMatchObject({ key: KEY, txnid: res.orderId, amount: "99.00", firstname: "Asha Rao", email: "asha@example.com", udf1: input.reference });
    expect(f.hash).toBe(requestHash(f, SALT));
  });

  it("never puts the salt in the form, and keeps the return addresses short and free of a query string", async () => {
    const { fields } = (await payu.createOrder(cfg, input)).checkout;
    expect(JSON.stringify(fields)).not.toContain(SALT);
    for (const url of [fields.surl, fields.furl, fields.curl]) {
      expect(url).toBe("https://unispheres.in/api/payments/return");
      expect(url.length).toBeLessThanOrEqual(50);
    }
  });

  it("uses PayU's test page when pointed at the test host, and ignores any other host", async () => {
    expect((await payu.createOrder(testCfg, input)).checkout.action).toBe("https://test.payu.in/_payment");
    expect((await payu.createOrder({ ...cfg, baseUrl: "https://evil.example" }, input)).checkout.action).toBe("https://secure.payu.in/_payment");
    expect((await payu.createOrder({ ...cfg, baseUrl: "not a url" }, input)).checkout.action).toBe("https://secure.payu.in/_payment");
  });

  it("cleans free text to what PayU accepts, and respects the 20-character test limit for the name", async () => {
    const odd = { ...input, customer: { id: "u", name: "Ásha <script>|Rao & Sons, Private Limited Company", email: "asha@example.com" } };
    const live = (await payu.createOrder(cfg, odd)).checkout.fields;
    expect(live.firstname).toBe("sha scriptRao Sons Private Limited Company");
    expect(live.firstname).not.toMatch(/[<>|&,]/);
    expect((await payu.createOrder(testCfg, odd)).checkout.fields.firstname.length).toBeLessThanOrEqual(20);
    expect((await payu.createOrder(cfg, { ...input, customer: { id: "u", name: "", email: "a@x.test" } })).checkout.fields.firstname).toBe("Member");
  });

  it("refuses to start without an email address", async () => {
    expect(await payu.createOrder(cfg, { ...input, customer: { id: "u", name: "A", email: "" } })).toMatchObject({ ok: false, code: "invalid_order" });
  });
});

describe("reading a payment from PayU", () => {
  const entry = (patch = {}) => ({ mihpayid: "403993715521889530", txnid: "bt0123456789abcdef0123456", amt: "99.00", mode: "UPI", status: "success", unmappedstatus: "captured", ...patch });
  const answer = (e, id = "bt0123456789abcdef0123456") => ({ status: 1, msg: "1 out of 1 Transactions Fetched Successfully", transaction_details: { [id]: e } });
  const ask = async (body, c = cfg) => {
    vi.stubGlobal("fetch", reply(body));
    return payu.getOrderPayment(c, { orderId: "bt0123456789abcdef0123456" });
  };

  it("asks verify_payment with the txnid and a hash of key|command|txnid|salt", async () => {
    const fetchMock = reply(answer(entry()));
    vi.stubGlobal("fetch", fetchMock);
    await payu.getOrderPayment(cfg, { orderId: "bt0123456789abcdef0123456" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://info.payu.in/merchant/postservice.php?form=2");
    expect(sentForm(fetchMock)).toEqual({ key: KEY, command: "verify_payment", var1: "bt0123456789abcdef0123456", hash: sha(`${KEY}|verify_payment|bt0123456789abcdef0123456|${SALT}`) });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => answer(entry()) });
    await payu.getOrderPayment(testCfg, { orderId: "bt0123456789abcdef0123456" });
    expect(fetchMock.mock.calls[1][0]).toBe("https://test.payu.in/merchant/postservice.php?form=2");
  });

  it("reports a captured, successful payment as paid, in paise", async () => {
    expect(await ask(answer(entry()))).toEqual({
      ok: true,
      payment: { id: "403993715521889530", orderId: "bt0123456789abcdef0123456", amountPaise: 9900, currency: "INR", status: "paid", method: "upi" },
    });
    expect((await ask(answer(entry({ amt: "99.5" })))).payment.amountPaise).toBe(9950);
  });

  it("never reports anything but a captured success as paid", async () => {
    const cases = [
      [{ status: "success", unmappedstatus: "auth" }, "pending"],
      [{ status: "pending", unmappedstatus: "pending" }, "pending"],
      [{ status: "failure", unmappedstatus: "failed" }, "failed"],
      [{ status: "failure", unmappedstatus: "userCancelled" }, "failed"],
      [{ status: "failure", unmappedstatus: "dropped" }, "failed"],
      [{ status: "failure", unmappedstatus: "bounced" }, "failed"],
      [{ status: "something new", unmappedstatus: "else" }, "pending"],
    ];
    for (const [patch, expected] of cases) expect((await ask(answer(entry(patch)))).payment.status, JSON.stringify(patch)).toBe(expected);
  });

  it("says 'not paid yet' when PayU has no such transaction, and an error when PayU does not answer sensibly", async () => {
    const notFound = { status: 0, msg: "0 out of 1 Transactions Fetched Successfully", transaction_details: { bt0123456789abcdef0123456: { mihpayid: "Not Found", status: "Not Found" } } };
    expect(await ask(notFound)).toEqual({ ok: true, payment: null });
    expect(await ask({ status: 0, msg: "error" })).toMatchObject({ ok: false, code: "provider_error" });
    expect(await ask(null)).toMatchObject({ ok: false, code: "provider_error" });
  });

  it("picks the successful attempt when PayU lists several for one txnid", async () => {
    const res = await ask(answer([entry({ status: "failure", unmappedstatus: "failed", mihpayid: "1" }), entry({ mihpayid: "2" }), entry({ status: "failure", unmappedstatus: "failed", mihpayid: "3" })]));
    expect(res.payment).toMatchObject({ id: "2", status: "paid" });
  });

  it("passes an unreadable amount on as unusable, so the app refuses it", async () => {
    expect(Number.isNaN((await ask(answer(entry({ amt: "abc" })))).payment.amountPaise)).toBe(true);
  });

  it("reports PayU being unreachable without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await payu.getOrderPayment(cfg, { orderId: "bt1" })).toMatchObject({ ok: false, code: "provider_unreachable" });
  });
});

describe("refunds", () => {
  it("calls cancel_refund_transaction with the PayU id, a token of at most 23 characters and the amount", async () => {
    const fetchMock = reply({ status: 1, msg: "Refund Request Queued", request_id: "123", error_code: 102 });
    vi.stubGlobal("fetch", fetchMock);
    expect(await payu.refundPayment(cfg, { paymentId: "403993715521889530", amountPaise: 9900, reason: "x" })).toEqual({ ok: true });
    const f = sentForm(fetchMock);
    expect(f).toMatchObject({ key: KEY, command: "cancel_refund_transaction", var1: "403993715521889530", var3: "99.00", var5: "https://unispheres.in/api/payments/webhook" });
    expect(f.var2).toMatch(/^[0-9a-f]{1,23}$/);
    expect(f.hash).toBe(sha(`${KEY}|cancel_refund_transaction|403993715521889530|${SALT}`));
  });

  it("passes PayU's reason through for administrators when it refuses", async () => {
    vi.stubGlobal("fetch", reply({ status: 0, msg: "Refund request failed, token already used" }));
    expect(await payu.refundPayment(cfg, { paymentId: "1", amountPaise: 100, reason: "x" })).toMatchObject({ ok: false, code: "provider_error", providerMessage: "Refund request failed, token already used" });
  });
});

describe("coming back from PayU", () => {
  it("reads the txnid PayU posts to the return address, and nothing else", () => {
    expect(payu.parseReturn(cfg, { query: new URLSearchParams(), form: new URLSearchParams("txnid=bt0123456789abcdef0123456&status=success") })).toEqual({ orderId: "bt0123456789abcdef0123456" });
    expect(payu.parseReturn(cfg, { query: new URLSearchParams("txnid=bt1"), form: null })).toEqual({ orderId: "bt1" });
    for (const bad of ["", "has space", "x".repeat(26), "a;b", "../x"]) {
      expect(payu.parseReturn(cfg, { query: new URLSearchParams(), form: new URLSearchParams({ txnid: bad }) }), bad).toBeNull();
    }
    expect(payu.parseReturn(cfg, { query: new URLSearchParams(), form: null })).toBeNull();
  });
});

describe("webhooks", () => {
  const paid = { mihpayid: "403993715521889530", key: KEY, txnid: "bt0123456789abcdef0123456", amount: "99.00", productinfo: "UniSphere blue tick", firstname: "Asha", email: "a@x.test", udf1: "ref", status: "success", unmappedstatus: "captured", mode: "UPI" };
  const signed = (p, salt = SALT) => new URLSearchParams({ ...p, hash: responseHashes(p, salt)[0] }).toString();

  it("accepts a payment webhook signed with the salt and describes it as paid", async () => {
    expect(await payu.parseWebhook(cfg, { rawBody: signed(paid), headers: new Headers() })).toEqual({
      ok: true,
      event: { type: "payment.paid", orderId: "bt0123456789abcdef0123456", paymentId: "403993715521889530" },
    });
  });

  it("describes a failed payment, and ignores one that is still pending", async () => {
    const failed = { ...paid, status: "failure", unmappedstatus: "failed", error: "E325" };
    expect((await payu.parseWebhook(cfg, { rawBody: signed(failed), headers: new Headers() })).event).toMatchObject({ type: "payment.failed", orderId: paid.txnid, reason: "E325" });
    const pending = { ...paid, status: "pending", unmappedstatus: "pending" };
    expect(await payu.parseWebhook(cfg, { rawBody: signed(pending), headers: new Headers() })).toEqual({ ok: true, event: null });
  });

  it("refuses a webhook that is unsigned, signed with another salt, for another merchant key, or altered", async () => {
    const cases = [
      new URLSearchParams(paid).toString(),
      signed(paid, "not-the-salt"),
      signed({ ...paid, key: "otherKey" }),
      signed(paid).replace("amount=99.00", "amount=1.00"),
      "",
      "garbage",
    ];
    for (const rawBody of cases) expect(await payu.parseWebhook(cfg, { rawBody, headers: new Headers() }), rawBody.slice(0, 30)).toEqual({ ok: false, status: 401 });
  });

  it("ignores refund failures and disputes without asking PayU anything", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const body of [{ action: "refund", status: "failure", mihpayid: "1" }, { action: "dispute", status: "raised", mihpayid: "1" }, { foo: "bar" }]) {
      expect(await payu.parseWebhook(cfg, { rawBody: JSON.stringify(body), headers: new Headers() })).toEqual({ ok: true, event: null });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await payu.parseWebhook(cfg, { rawBody: "{not json", headers: new Headers() })).toEqual({ ok: false, status: 400 });
  });

  it("does not believe an unsigned refund notice until PayU confirms that refund", async () => {
    const notice = JSON.stringify({ merchantTxnId: paid.txnid, mihpayid: "403993715521889530", request_id: "777", amt: "99.00", status: "success", action: "refund", key: KEY });
    const confirmedBody = { status: 1, transaction_details: { 403993715521889530: { 777: { mihpayid: "403993715521889530", request_id: "777", action: "refund", status: "success" } } } };
    const fetchMock = reply(confirmedBody);
    vi.stubGlobal("fetch", fetchMock);
    expect(await payu.parseWebhook(cfg, { rawBody: notice, headers: new Headers() })).toEqual({ ok: true, event: { type: "refund.done", paymentId: "403993715521889530" } });
    expect(sentForm(fetchMock)).toMatchObject({ command: "check_action_status", var1: "403993715521889530", var2: "payuid" });

    // A forged notice: PayU knows of no such refund.
    vi.stubGlobal("fetch", reply({ status: 0, transaction_details: { 403993715521889530: "no action status found" } }));
    expect(await payu.parseWebhook(cfg, { rawBody: notice, headers: new Headers() })).toEqual({ ok: false, status: 401 });
    // The refund exists but is a different one, or has not succeeded.
    vi.stubGlobal("fetch", reply({ status: 1, transaction_details: { 403993715521889530: { 999: { request_id: "999", action: "refund", status: "success" } } } }));
    expect(await payu.parseWebhook(cfg, { rawBody: notice, headers: new Headers() })).toEqual({ ok: false, status: 401 });
    vi.stubGlobal("fetch", reply({ status: 1, transaction_details: { 403993715521889530: { 777: { request_id: "777", action: "refund", status: "QUEUED" } } } }));
    expect(await payu.parseWebhook(cfg, { rawBody: notice, headers: new Headers() })).toEqual({ ok: false, status: 401 });
  });

  it("lets PayU retry if it could not be asked to confirm a refund", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const notice = JSON.stringify({ mihpayid: "1", status: "success", action: "refund" });
    await expect(payu.parseWebhook(cfg, { rawBody: notice, headers: new Headers() })).rejects.toThrow();
  });

  it("is ready for webhooks as soon as the key and salt are set", () => {
    expect(payu.isConfigured(cfg)).toBe(true);
    expect(payu.webhookReady(cfg)).toBe(true);
    expect(payu.webhookReady({ ...cfg, keySecret: undefined })).toBe(false);
    expect(payu.isConfigured({ ...cfg, keyId: "" })).toBe(false);
  });
});
