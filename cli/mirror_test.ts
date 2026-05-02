import { deepStrictEqual as equal, throws } from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { mirrorPairs, parsePairs } from "./mirror.ts";

const eq = <T>(actual: T, expected: T) => equal(actual, expected);

Deno.test("parsePairs: single pair", () => {
  eq(parsePairs("CHANGELOG.md:docs/CHANGELOG.md"), [
    { src: "CHANGELOG.md", dst: "docs/CHANGELOG.md" },
  ]);
});

Deno.test("parsePairs: blank lines and surrounding whitespace tolerated", () => {
  eq(
    parsePairs(`
  CHANGELOG.md  :  docs/CHANGELOG.md

a:b
`),
    [
      { src: "CHANGELOG.md", dst: "docs/CHANGELOG.md" },
      { src: "a", dst: "b" },
    ],
  );
});

Deno.test("parsePairs: only the first colon splits (dst can contain colons)", () => {
  // Matches the bash `${line%%:*}` / `${line#*:}` semantics: src is up to
  // the first colon, dst is the rest.
  eq(parsePairs("a:b:c"), [{ src: "a", dst: "b:c" }]);
});

Deno.test("parsePairs: empty input → empty list", () => {
  eq(parsePairs(""), []);
  eq(parsePairs("\n\n  \n"), []);
});

Deno.test("parsePairs: missing colon throws with line number", () => {
  throws(
    () => parsePairs("CHANGELOG.md\nfoo:bar"),
    /line 1.*not a "src:dst" pair/,
  );
});

Deno.test("parsePairs: empty src or dst throws", () => {
  throws(() => parsePairs(":dst"), /empty src or dst/);
  throws(() => parsePairs("src:"), /empty src or dst/);
});

Deno.test("mirrorPairs: copies file and creates parent directory", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    const src = join(tmp, "in.txt");
    const dst = join(tmp, "nested", "out", "out.txt");
    await Deno.writeTextFile(src, "hello mirror");
    await mirrorPairs([{ src, dst }]);
    eq(await readFile(dst, "utf-8"), "hello mirror");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("mirrorPairs: missing source throws", async () => {
  const tmp = await Deno.makeTempDir();
  try {
    let threw = false;
    try {
      await mirrorPairs([{
        src: join(tmp, "nope.txt"),
        dst: join(tmp, "out.txt"),
      }]);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("Expected mirrorPairs to throw on missing src");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
