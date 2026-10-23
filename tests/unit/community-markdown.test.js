import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMarkdown } from "@/components/posts/chat-markdown";
import { CHAT_LIMITS, isCheapToRender } from "@/lib/markdown";

const render = (text) => renderToStaticMarkup(h(ChatMarkdown, { text }));

describe("chat messages are rendered as Markdown without ever running anything", () => {
  it("renders ordinary formatting", () => {
    const html = render("**bold** and *italic* and `code`\n\n- one\n- two\n\n> quoted");
    expect(html).toContain("<strong");
    expect(html).toContain("<em");
    expect(html).toContain("<code");
    expect(html).toContain("<li");
    expect(html).toContain("<blockquote");
  });

  it("shows raw HTML as text instead of interpreting it", () => {
    const html = render('<script>alert(1)</script><img src=x onerror="alert(1)"><iframe src="https://evil.example"></iframe>');
    expect(html).not.toMatch(/<(script|img|iframe)/i); // no element of any of these exists; the same characters appear only as escaped text
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops dangerous link protocols but keeps the words", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "vbscript:x", "file:///etc/passwd", "//evil.example/x"]) {
      const html = render(`[click me](${bad})`);
      expect(html, bad).not.toMatch(/href="(javascript|data|vbscript|file|\/\/)/i);
      expect(html).toContain("click me");
    }
  });

  it("opens external links safely and never renders images", () => {
    const html = render("[site](https://example.org/path) ![tracker](https://evil.example/pixel.png)");
    expect(html).toContain('href="https://example.org/path"');
    expect(html).toMatch(/rel="noopener noreferrer nofollow ugc"/);
    expect(html).toContain('target="_blank"');
    expect(html).not.toMatch(/<img/i);
  });

  it("does not turn credentials in a link into a link", () => {
    expect(render("[bank](https://google.com@evil.example/login)")).not.toContain("<a");
  });

  it("does not allow tables, headings or footnotes to inflate a message", () => {
    const html = render("# Big\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).not.toMatch(/<table|<h1|<thead/);
  });

  it("keeps ordinary text intact", () => {
    expect(render("5 * 3 = 15, snake_case_name, and a_b_c")).toContain("snake_case_name");
    expect(render("it's 100% fine <3")).toContain("it&#x27;s 100% fine");
  });
});

describe("expensive-looking messages are shown as plain text instead of being parsed", () => {
  it("accepts normal messages", () => {
    expect(isCheapToRender("hello")).toBe(true);
    expect(isCheapToRender("- a\n  - b\n    - c\n\n> quote\n\n```\ncode\n```")).toBe(true);
  });

  it("refuses too many lines, deep quotes, deep lists, too many links and over-long text", () => {
    expect(isCheapToRender("x\n".repeat(CHAT_LIMITS.lines + 1))).toBe(false);
    expect(isCheapToRender(`${">".repeat(CHAT_LIMITS.quoteDepth + 1)} deep`)).toBe(false);
    expect(isCheapToRender(`${" ".repeat(2 * CHAT_LIMITS.listDepth)}- too deep`)).toBe(false);
    expect(isCheapToRender("[a](https://x.example) ".repeat(CHAT_LIMITS.links + 1))).toBe(false);
    expect(isCheapToRender("a".repeat(CHAT_LIMITS.chars + 1))).toBe(false);
  });

  it("renders a refused message as escaped plain text", () => {
    const deep = `${">".repeat(9)} <b>bold?</b>`;
    const html = render(deep);
    expect(html).not.toContain("<blockquote");
    expect(html).toContain("&lt;b&gt;");
  });
});
