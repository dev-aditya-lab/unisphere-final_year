import { describe, expect, it } from "vitest";
import { tokenizeRichText } from "@/lib/text";

describe("user text is data, never markup", () => {
  it("keeps HTML and script-like text as plain text tokens", () => {
    const tokens = tokenizeRichText('<img src=x onerror=alert(1)> <script>alert(1)</script> javascript:alert(1) data:text/html,<b>x</b>');
    expect(tokens.every((t) => t.type === "text")).toBe(true);
  });

  it("only ever turns http(s) addresses into links", () => {
    const urls = tokenizeRichText("a http://ok.example/x b https://ok.example/y c ftp://no.example d javascript:alert(1) e //evil.example").filter((t) => t.type === "url");
    expect(urls.map((t) => t.value)).toEqual(["http://ok.example/x", "https://ok.example/y"]);
  });

  it("a link cannot carry quotes or angle brackets out of its token", () => {
    const [url] = tokenizeRichText('https://ok.example/a"onmouseover="alert(1)').filter((t) => t.type === "url");
    expect(url.value).not.toMatch(/["'<>]/);
  });

  it.each([
    ["dots", "http://" + ".".repeat(200_000)],
    ["repeated scheme", "http://.".repeat(25_000)],
    ["hashes", "#".repeat(200_000)],
    ["tag and at", "#a@".repeat(60_000)],
    ["long mention", "@a" + "-_".repeat(100_000)],
  ])("stays fast on hostile input (%s)", (_name, input) => {
    const started = performance.now();
    tokenizeRichText(input);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
