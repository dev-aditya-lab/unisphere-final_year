import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownText } from "@/components/posts/markdown-text";
import { markdownExcerpt, markdownToPlain, safeHref } from "@/lib/markdown";

const render = (text) => renderToStaticMarkup(createElement(MarkdownText, { text }));

describe("safeHref: which addresses may become links", () => {
  it("allows absolute http, https and mailto addresses", () => {
    expect(safeHref("https://example.com/a?b=1#c")).toBe("https://example.com/a?b=1#c");
    expect(safeHref("http://example.com")).toBe("http://example.com");
    expect(safeHref("mailto:hello@example.com")).toBe("mailto:hello@example.com");
  });

  it("refuses every other scheme, however it is disguised", () => {
    for (const bad of [
      "javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "java\nscript:alert(1)", "java​script:alert(1)", "\u0001javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "file:///etc/passwd", "blob:https://x/y", "ftp://example.com", "tel:+911234567890", "intent://x#Intent;end",
      "//evil.example/x", "/relative/path", "#anchor", "evil.example", "https:", "https://", "http://user:pass@evil.example", "https://good.example@evil.example", "https://exa mple.com",
      "", "   ", null, undefined, 42, {}, "https://" + "a".repeat(2100),
    ]) {
      expect(safeHref(bad), String(bad).slice(0, 40)).toBe("");
    }
  });
});

describe("rendering: Markdown that should work", () => {
  it("bold, italic, strikethrough and inline code", () => {
    const html = render("**bold** and *italic* and ~~gone~~ and `code`");
    expect(html).toContain("<strong");
    expect(html).toContain("bold</strong>");
    expect(html).toContain("<em");
    expect(html).toContain("<del");
    expect(html).toContain("<code");
  });

  it("lists, numbered lists and blockquotes", () => {
    expect(render("- one\n- two")).toMatch(/<ul[^>]*>[\s\S]*<li[^>]*>one<\/li>[\s\S]*<li[^>]*>two<\/li>/);
    expect(render("1. first\n2. second")).toMatch(/<ol[^>]*>[\s\S]*first/);
    expect(render("> a quote")).toMatch(/<blockquote[^>]*>[\s\S]*a quote/);
  });

  it("code blocks keep their text and show markup as text", () => {
    const html = render("```js\nconst a = '<b>x</b>';\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
  });

  it("paragraph breaks and single line breaks are both kept", () => {
    const html = render("line one\nline two\n\nnew paragraph");
    expect(html.match(/<p/g)).toHaveLength(2);
    expect(html).toContain("line one\nline two"); // single newlines survive (the paragraph is pre-wrap)
  });

  it("links: written labels and bare addresses, always opened safely", () => {
    const html = render("[docs](https://example.com/docs) and https://example.com/very/long/path/that/keeps/going/and/going/forever");
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain(">docs</a>");
    expect(html).toMatch(/rel="noopener noreferrer nofollow ugc"/);
    expect(html).toContain('target="_blank"');
    expect(html).toMatch(/example\.com\/very\/long\/path[^<]*…<\/a>/); // a bare address is shortened for reading
  });

  it("hashtags and mentions are still links, but not inside code", () => {
    const html = render("hello #robotics from @ada_l and `#notatag`");
    expect(html).toContain('href="/explore?tag=robotics"');
    expect(html).toContain('href="/u/ada_l"');
    expect(html).not.toContain("tag=notatag");
  });

  it("a plain post with no Markdown reads exactly as before", () => {
    const html = render("Just a normal post.\nWith two lines.");
    expect(html).toContain("Just a normal post.\nWith two lines.");
    expect(html).not.toContain("<ul");
  });

  it("headings do not shout: they become a bold line, and a hashtag at the start of a line is not a heading", () => {
    expect(render("# Big title\ntext")).not.toMatch(/<h[1-6]/);
    expect(render("# Big title")).toContain("Big title");
    expect(render("#robotics is fun")).toContain("tag=robotics");
  });
});

describe("rendering: hostile input is inert", () => {
  const dangerous = [
    "<script>alert(1)</script>",
    '<img src=x onerror="alert(1)">',
    '<a href="javascript:alert(1)">click</a>',
    "<iframe src='https://evil.example'></iframe>",
    '<svg onload="alert(1)"></svg>',
    "<style>body{display:none}</style>",
    '<div style="position:fixed;inset:0">cover</div>',
    "[x](javascript:alert(1))",
    "[x](JaVaScRiPt:alert(1))",
    "[x](java&#x09;script:alert(1))",
    "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "[x](vbscript:msgbox(1))",
    "![pixel](https://tracker.example/p.gif)",
    '![x](javascript:alert(1) "t")',
    "<https://evil.example>",
    "[ref]: javascript:alert(1)\n\n[ref]",
    "[a](//evil.example)",
    "`</code><script>alert(1)</script>`",
    "**<script>alert(1)</script>**",
    "> <img src=x onerror=alert(1)>",
    "- <svg/onload=alert(1)>",
  ];

  // The tags that really are in the output (text such as "&lt;img onerror=...&gt;" is escaped and is just words).
  const tagsOf = (html) => [...html.matchAll(/<(\/?)([a-z][a-z0-9-]*)([^>]*)>/gi)].filter((m) => !m[1]).map((m) => ({ name: m[2].toLowerCase(), attrs: m[3] }));
  const ALLOWED_TAGS = new Set(["div", "p", "strong", "em", "del", "a", "ul", "ol", "li", "blockquote", "code", "pre", "span", "hr", "br"]);

  it("emits only the permitted tags, with no event handlers, sources, styles or unsafe link addresses", () => {
    for (const text of dangerous) {
      const tags = tagsOf(render(text));
      for (const t of tags) {
        expect(ALLOWED_TAGS.has(t.name), `${text} -> <${t.name}>`).toBe(true);
        expect(t.attrs, text).not.toMatch(/\son[a-z]+\s*=/i);
        expect(t.attrs, text).not.toMatch(/\s(src|style|srcdoc|formaction|xlink:href)\s*=/i);
        if (t.name === "a") {
          expect(t.attrs, text).toMatch(/href="https?:|href="mailto:/i);
          expect(t.attrs, text).not.toMatch(/javascript|data:|vbscript|file:/i);
        }
      }
    }
  });

  it("shows raw HTML as harmless text, so nothing the author wrote vanishes", () => {
    const html = render("I use <div> and <b>tags</b> in my notes");
    expect(html).toContain("&lt;div&gt;");
    expect(html).toContain("&lt;b&gt;tags&lt;/b&gt;");
  });

  it("an unsafe link becomes its label, not a link", () => {
    const html = render("[click me](javascript:alert(1))");
    expect(html).toContain("click me");
    expect(html).not.toContain("<a");
  });

  it("survives pathological input without throwing", () => {
    const nasty = ["*".repeat(5000), "[".repeat(3000), "> ".repeat(500) + "x", "- ".repeat(500) + "x", "`".repeat(4001), "\u0000\u0001<>&\"'", "a".repeat(20000)];
    for (const text of nasty) expect(() => render(text)).not.toThrow();
  });
});

describe("excerpts and plain text", () => {
  it("cuts on a paragraph or line, never inside a list or a code block, and closes an open fence", () => {
    const text = `${"First paragraph. ".repeat(20)}\n\n${"Second paragraph. ".repeat(20)}`;
    const cut = markdownExcerpt(text, 400);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(402);
    expect(cut).not.toContain("Second");
    const fenced = markdownExcerpt(`intro\n\n\`\`\`\n${"code line\n".repeat(80)}\`\`\``, 200);
    expect((fenced.match(/```/g) ?? []).length % 2).toBe(0);
    expect(markdownExcerpt("short", 500)).toBe("short");
  });

  it("strips Markdown marks for titles, snippets and notifications", () => {
    expect(markdownToPlain("**Big** news: [read more](https://example.com) `now`\n- item one\n> quoted")).toBe("Big news: read more now item one quoted");
    expect(markdownToPlain("snake_case_name and 2*3*4")).toBe("snake_case_name and 2*3*4");
    expect(markdownToPlain("x ".repeat(100), 20).endsWith("…")).toBe(true);
  });
});
