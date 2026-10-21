import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A double-click, a re-run effect or a retry while the first try is still going must not store the same bytes twice.
let sent;
class FakeXhr {
  constructor() {
    this.upload = {};
    sent.push(this);
  }
  open() {}
  send() {}
  abort() {
    this.onabort?.();
  }
  reply(body) {
    this.response = body;
    this.onload?.();
  }
  progress(loaded, total) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
}

const { uploadFileWithProgress } = await import("@/lib/storage/client");
const pic = (over = {}) => ({ name: "me.jpg", size: 1000, lastModified: 1, type: "image/jpeg", ...over });

beforeEach(() => {
  sent = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("FormData", class { append() {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("uploadFileWithProgress", () => {
  it("sends the same picked file for the same purpose once, however many times it is asked", async () => {
    const file = pic();
    const a = uploadFileWithProgress(file, "avatar");
    const b = uploadFileWithProgress(pic(), "avatar"); // a second File object for the same pick (same name, size, date)
    expect(sent).toHaveLength(1);
    sent[0].reply({ ok: true, fileId: "f1", key: "avatar/u/f1.webp" });
    expect(await a).toEqual(await b);
    expect((await a).fileId).toBe("f1");
  });

  it("tells every waiting caller how far it got", async () => {
    const one = vi.fn();
    const two = vi.fn();
    const a = uploadFileWithProgress(pic(), "avatar", one);
    const b = uploadFileWithProgress(pic(), "avatar", two);
    sent[0].progress(50, 100);
    expect(one).toHaveBeenCalledWith(50);
    expect(two).toHaveBeenCalledWith(50);
    sent[0].reply({ ok: true, fileId: "f" });
    await Promise.all([a, b]);
  });

  it("starts a fresh upload once the first has finished, whether it worked or not", async () => {
    const a = uploadFileWithProgress(pic(), "avatar");
    sent[0].reply({ ok: false, error: "too large" });
    await a;
    const b = uploadFileWithProgress(pic(), "avatar");
    expect(sent).toHaveLength(2);
    sent[1].reply({ ok: true, fileId: "f2" });
    expect((await b).fileId).toBe("f2");
  });

  it("treats a different file, or the same file for another purpose, as a different upload", async () => {
    const a = uploadFileWithProgress(pic(), "avatar");
    const b = uploadFileWithProgress(pic({ size: 2000 }), "avatar");
    const c = uploadFileWithProgress(pic(), "cover");
    expect(sent).toHaveLength(3);
    sent.forEach((x, i) => x.reply({ ok: true, fileId: `f${i}` }));
    await Promise.all([a, b, c]);
  });

  it("starts again after the first was cancelled, instead of joining a transfer that was stopped", async () => {
    const stop = new AbortController();
    const a = uploadFileWithProgress(pic(), "post_attachment", undefined, { signal: stop.signal });
    stop.abort();
    expect(await a).toMatchObject({ ok: false, aborted: true });
    const b = uploadFileWithProgress(pic(), "post_attachment");
    expect(sent).toHaveLength(2);
    sent[1].reply({ ok: true, fileId: "again" });
    expect((await b).fileId).toBe("again");
  });

  it("lets a caller that joined stop waiting without stopping the upload it joined", async () => {
    const a = uploadFileWithProgress(pic(), "avatar");
    const stop = new AbortController();
    const b = uploadFileWithProgress(pic(), "avatar", undefined, { signal: stop.signal });
    stop.abort();
    expect(await b).toMatchObject({ ok: false, aborted: true });
    sent[0].reply({ ok: true, fileId: "kept" });
    expect((await a).fileId).toBe("kept");
    expect(sent).toHaveLength(1);
  });

  it("reports a network failure and then allows a retry", async () => {
    const a = uploadFileWithProgress(pic(), "avatar");
    sent[0].onerror();
    expect((await a).ok).toBe(false);
    const b = uploadFileWithProgress(pic(), "avatar");
    expect(sent).toHaveLength(2);
    sent[1].reply({ ok: true, fileId: "ok" });
    expect((await b).ok).toBe(true);
  });
});
