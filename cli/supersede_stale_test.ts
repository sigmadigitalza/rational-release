import { deepStrictEqual as eq, rejects } from "node:assert/strict";
import { filterStale, safeRef, supersedeStale } from "./supersede_stale.ts";
import type { GhRunner } from "./gh.ts";

Deno.test("filterStale: matches prefix, excludes current branch", () => {
  const prs = [
    { number: 1, headRefName: "release/v0.9.1" },
    { number: 2, headRefName: "release/v0.10.0" }, // current
    { number: 3, headRefName: "feature/foo" }, // wrong prefix
    { number: 4, headRefName: "release/v0.8.0" },
  ];
  eq(
    filterStale(prs, "release/v", "release/v0.10.0"),
    [
      { number: 1, headRefName: "release/v0.9.1" },
      { number: 4, headRefName: "release/v0.8.0" },
    ],
  );
});

Deno.test("filterStale: empty prefix returns empty (no nuking)", () => {
  const prs = [{ number: 1, headRefName: "anything" }];
  eq(filterStale(prs, "", "x"), []);
});

Deno.test("filterStale: no stale PRs returns empty", () => {
  eq(
    filterStale(
      [{ number: 1, headRefName: "release/v1.0.0" }],
      "release/v",
      "release/v1.0.0",
    ),
    [],
  );
});

Deno.test("safeRef: strips backticks", () => {
  eq(safeRef("release/v`evil`"), "release/vevil");
  eq(safeRef("release/v1.2.3"), "release/v1.2.3");
});

Deno.test("supersedeStale: empty prefix → skipped=true, no gh calls", async () => {
  let calls = 0;
  const gh: GhRunner = () => {
    calls += 1;
    return Promise.resolve({ ok: true, stdout: "[]", stderr: "" });
  };
  const res = await supersedeStale({
    prefix: "",
    currentBranch: "x",
    version: "1.0.0",
    ghRunner: gh,
  });
  eq(res.skipped, true);
  eq(calls, 0);
});

Deno.test("supersedeStale: closes matched PRs with version-templated comment", async () => {
  const calls: { cmd: string; args: readonly string[] }[] = [];
  const gh: GhRunner = (args) => {
    calls.push({ cmd: args[0], args });
    if (args[0] === "pr" && args[1] === "list") {
      return Promise.resolve({
        ok: true,
        stdout: JSON.stringify([
          { number: 1, headRefName: "release/v0.9.1" },
          { number: 2, headRefName: "release/v0.10.0" },
        ]),
        stderr: "",
      });
    }
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  const res = await supersedeStale({
    prefix: "release/v",
    currentBranch: "release/v0.10.0",
    version: "0.10.0",
    ghRunner: gh,
  });
  eq(res.skipped, false);
  eq(res.matched.length, 1);
  eq(res.matched[0].number, 1);
  eq(res.closed.length, 1);
  eq(res.failed.length, 0);
  // Find the close call.
  const closeCall = calls.find((c) => c.args[1] === "close");
  if (!closeCall) throw new Error("expected a pr close call");
  eq(closeCall.args[2], "1");
  eq(closeCall.args[3], "--comment");
  eq(closeCall.args[4].includes("v0.10.0"), true);
  eq(closeCall.args[5], "--delete-branch");
});

Deno.test("supersedeStale: close failures move to failed[], do not abort", async () => {
  const gh: GhRunner = (args) => {
    if (args[1] === "list") {
      return Promise.resolve({
        ok: true,
        stdout: JSON.stringify([
          { number: 1, headRefName: "release/v0.9.1" },
          { number: 2, headRefName: "release/v0.9.0" },
        ]),
        stderr: "",
      });
    }
    if (args[2] === "1") {
      return Promise.resolve({ ok: false, stdout: "", stderr: "denied" });
    }
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  const res = await supersedeStale({
    prefix: "release/v",
    currentBranch: "release/v0.10.0",
    version: "0.10.0",
    ghRunner: gh,
  });
  eq(res.matched.length, 2);
  eq(res.closed.map((p) => p.number), [2]);
  eq(res.failed.map((p) => p.number), [1]);
  eq(res.failed[0].error, "denied");
});

Deno.test("supersedeStale: throws if `gh pr list` fails", async () => {
  const gh: GhRunner = () =>
    Promise.resolve({ ok: false, stdout: "", stderr: "rate limited" });
  await rejects(
    () =>
      supersedeStale({
        prefix: "release/v",
        currentBranch: "x",
        version: "1.0.0",
        ghRunner: gh,
      }),
    /gh pr list failed: rate limited/,
  );
});

Deno.test("supersedeStale: respects custom base + limit", async () => {
  let captured: readonly string[] = [];
  const gh: GhRunner = (args) => {
    if (args[1] === "list") captured = args;
    return Promise.resolve({ ok: true, stdout: "[]", stderr: "" });
  };
  await supersedeStale({
    prefix: "release/v",
    currentBranch: "x",
    version: "1.0.0",
    base: "trunk",
    limit: 50,
    ghRunner: gh,
  });
  eq(captured.includes("trunk"), true);
  eq(captured.includes("50"), true);
});
