/**
 * Convert a Keep-a-Changelog Markdown file to a standalone HTML page
 * using the rational-release docs site template.
 *
 * Minimal Markdown-to-HTML: headings, list items, links, inline code,
 * bold, and paragraphs. Good enough for changelog files without pulling
 * in a full Markdown library.
 *
 * Uses only node:* standard-library imports so it runs on Deno, Node,
 * and Bun unchanged.
 */

import { readFile, writeFile } from "node:fs/promises";

// ── Helpers ──────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(line: string): string {
  let out = escapeHtml(line);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return out;
}

// ── Markdown → HTML body ─────────────────────────────────────────────

export function markdownToHtmlBody(md: string): string {
  const htmlLines: string[] = [];
  let inList = false;

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();

    const hMatch = line.match(/^(#{1,6})\s+(.*)/);
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

    if (line.startsWith("- ")) {
      if (!inList) {
        htmlLines.push("<ul>");
        inList = true;
      }
      htmlLines.push(`  <li>${inlineMarkdown(line.slice(2))}</li>`);
      continue;
    }

    if (line.trim() === "") {
      if (inList) {
        htmlLines.push("</ul>");
        inList = false;
      }
      continue;
    }

    if (inList) {
      htmlLines.push("</ul>");
      inList = false;
    }
    htmlLines.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  if (inList) htmlLines.push("</ul>");
  return htmlLines.join("\n    ");
}

// ── Full-page template ───────────────────────────────────────────────

export function wrapInTemplate(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Changelog \u2014 rational-release</title>
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
      <a href="changelog.html">Changelog</a>
      &middot;
      <a href="https://sigmadigital.io">Sigma Digital</a>
    </p>
  </footer>

</body>
</html>
`;
}

// ── File I/O entry point ─────────────────────────────────────────────

export async function generateChangelogHtml(
  src: string,
  dst: string,
): Promise<void> {
  const md = await readFile(src, "utf-8");
  const body = markdownToHtmlBody(md);
  const html = wrapInTemplate(body);
  await writeFile(dst, html);
}
