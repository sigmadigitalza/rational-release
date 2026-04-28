#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Convert CHANGELOG.md to docs/changelog.html using the docs site template.
 *
 * Minimal Markdown-to-HTML: headings, list items, links, inline code, and
 * paragraphs. Good enough for Keep-a-Changelog files without pulling in a
 * full Markdown library.
 */

const src = Deno.args[0] ?? "CHANGELOG.md";
const dst = Deno.args[1] ?? "docs/changelog.html";

const md = await Deno.readTextFile(src);

// ── Minimal Markdown → HTML ──────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(line: string): string {
  let out = escapeHtml(line);
  // inline code
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  // links [text](url)
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
  );
  // bold
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

const htmlLines: string[] = [];
let inList = false;

for (const raw of md.split("\n")) {
  const line = raw.trimEnd();

  // Headings
  const hMatch = line.match(/^(#{1,4})\s+(.*)/);
  if (hMatch) {
    if (inList) {
      htmlLines.push("</ul>");
      inList = false;
    }
    const level = hMatch[1].length;
    const text = inlineMarkdown(hMatch[2]);
    htmlLines.push(`<h${level}>${text}</h${level}>`);
    continue;
  }

  // List items
  if (line.startsWith("- ")) {
    if (!inList) {
      htmlLines.push("<ul>");
      inList = true;
    }
    htmlLines.push(`  <li>${inlineMarkdown(line.slice(2))}</li>`);
    continue;
  }

  // Blank line
  if (line.trim() === "") {
    if (inList) {
      htmlLines.push("</ul>");
      inList = false;
    }
    continue;
  }

  // Paragraph fallback
  if (inList) {
    htmlLines.push("</ul>");
    inList = false;
  }
  htmlLines.push(`<p>${inlineMarkdown(line)}</p>`);
}

if (inList) htmlLines.push("</ul>");

const body = htmlLines.join("\n    ");

// ── Wrap in the docs site template ───────────────────────────────────

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Changelog — rational-release</title>
  <meta name="description" content="All notable changes to rational-release, in Keep-a-Changelog format.">
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
  <header class="site-header">
    <div class="site-header-inner">
      <a href="./" class="brand">rational-release</a>
      <nav class="nav">
        <a href="./">Overview</a>
        <a href="tutorial.html">Tutorial</a>
        <a href="advanced.html">Advanced</a>
        <a href="changelog.html" class="current">Changelog</a>
        <a href="https://github.com/sigmadigitalza/rational-release">GitHub</a>
      </nav>
    </div>
  </header>

  <main class="container">
    ${body}
  </main>

  <footer class="site-footer">
    <p>
      <a href="https://github.com/sigmadigitalza/rational-release">GitHub</a>
      &middot;
      <a href="https://jsr.io/@sigmadigitalza/rational-release">JSR</a>
      &middot;
      <a href="https://github.com/sigmadigitalza/rational-release/blob/main/CHANGELOG.md">Changelog</a>
      &middot;
      <a href="https://sigmadigital.io">Sigma Digital</a>
    </p>
  </footer>

</body>
</html>
`;

await Deno.writeTextFile(dst, html);
console.log(`Generated ${dst} from ${src}`);
