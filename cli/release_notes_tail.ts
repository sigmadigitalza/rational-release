/**
 * Format the "Pull requests in this release" tail that cut-release
 * appends to the GitHub Release body.
 *
 * Splitting render from fetch lets us cover the empty-list, missing-tag,
 * and bot-author cases as unit tests. The workflow still owns the gh
 * call; this module only takes the parsed JSON.
 */

export interface MergedPr {
  number: number;
  title: string;
  mergedAt: string;
  author?: { login?: string; is_bot?: boolean } | null;
}

export interface RenderTailOptions {
  prs: MergedPr[];
  sinceEpoch: number;
  prevTag: string | null;
  version: string;
  repo: string | null;
}

function fromIso(s: string): number {
  const t = Date.parse(s);
  if (Number.isNaN(t)) return 0;
  return Math.floor(t / 1000);
}

function attribute(pr: MergedPr): string {
  const login = pr.author?.login ?? "";
  if (!login || pr.author?.is_bot) {
    return `- ${pr.title} (#${pr.number})`;
  }
  return `- ${pr.title} (#${pr.number} by @${login})`;
}

export function renderReleaseNotesTail(opts: RenderTailOptions): string {
  const { prs, sinceEpoch, prevTag, version, repo } = opts;
  const filtered = prs
    .filter((pr) => fromIso(pr.mergedAt) > sinceEpoch)
    .sort((a, b) => a.number - b.number);

  const lines: string[] = ["", "### Pull requests in this release", ""];
  if (filtered.length === 0) {
    lines.push("_No merged pull requests in this range._");
  } else {
    for (const pr of filtered) lines.push(attribute(pr));
  }
  if (prevTag && repo) {
    lines.push(
      "",
      `**Full diff:** https://github.com/${repo}/compare/${prevTag}...v${version}`,
    );
  }
  return lines.join("\n") + "\n";
}
