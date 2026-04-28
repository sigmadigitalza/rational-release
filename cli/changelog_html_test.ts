import { markdownToHtmlBody, wrapInTemplate } from "./changelog_html.ts";

Deno.test("markdownToHtmlBody: headings", () => {
  const html = markdownToHtmlBody("# Title\n## Subtitle\n### H3");
  if (!html.includes("<h1>Title</h1>")) throw new Error("Missing h1");
  if (!html.includes("<h2>Subtitle</h2>")) throw new Error("Missing h2");
  if (!html.includes("<h3>H3</h3>")) throw new Error("Missing h3");
});

Deno.test("markdownToHtmlBody: list items", () => {
  const html = markdownToHtmlBody("- one\n- two\n");
  if (!html.includes("<ul>")) throw new Error("Missing <ul>");
  if (!html.includes("<li>one</li>")) throw new Error("Missing li one");
  if (!html.includes("<li>two</li>")) throw new Error("Missing li two");
  if (!html.includes("</ul>")) throw new Error("Missing </ul>");
});

Deno.test("markdownToHtmlBody: inline code", () => {
  const html = markdownToHtmlBody("Use `foo` here");
  if (!html.includes("<code>foo</code>")) throw new Error("Missing inline code");
});

Deno.test("markdownToHtmlBody: links", () => {
  const html = markdownToHtmlBody("[text](https://example.com)");
  if (!html.includes('<a href="https://example.com">text</a>')) {
    throw new Error("Missing link");
  }
});

Deno.test("markdownToHtmlBody: bold", () => {
  const html = markdownToHtmlBody("**bold** text");
  if (!html.includes("<strong>bold</strong>")) throw new Error("Missing bold");
});

Deno.test("markdownToHtmlBody: escapes HTML in content", () => {
  const html = markdownToHtmlBody("a <script>alert(1)</script> b");
  if (html.includes("<script>")) throw new Error("HTML not escaped");
  if (!html.includes("&lt;script&gt;")) throw new Error("Missing escaped HTML");
});

Deno.test("markdownToHtmlBody: paragraph fallback", () => {
  const html = markdownToHtmlBody("Just a line of text.");
  if (!html.includes("<p>Just a line of text.</p>")) {
    throw new Error("Missing paragraph");
  }
});

Deno.test("wrapInTemplate: produces valid HTML", () => {
  const html = wrapInTemplate("<h1>Test</h1>");
  if (!html.includes("<!doctype html>")) throw new Error("Missing doctype");
  if (!html.includes("<h1>Test</h1>")) throw new Error("Missing body content");
  if (!html.includes("rational-release")) throw new Error("Missing brand");
  if (!html.includes("sigmadigital.io")) throw new Error("Missing Sigma Digital link");
});
