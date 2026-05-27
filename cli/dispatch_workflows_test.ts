import { deepStrictEqual as eq } from "node:assert/strict";
import {
  dispatchWorkflows,
  parseWorkflowList,
  safeName,
} from "./dispatch_workflows.ts";
import type { GhRunner } from "./gh.ts";

Deno.test("parseWorkflowList: basic", () => {
  eq(parseWorkflowList("CI\nLint"), ["CI", "Lint"]);
});

Deno.test("parseWorkflowList: trims surrounding whitespace + CRLF", () => {
  eq(parseWorkflowList("  CI  \r\n  Lint  \r\n"), ["CI", "Lint"]);
});

Deno.test("parseWorkflowList: skips blank lines and `# ...` comments", () => {
  const raw = `
CI
# inline comment — should be skipped
  # indented comment — also skipped

Lint
`;
  eq(parseWorkflowList(raw), ["CI", "Lint"]);
});

Deno.test("parseWorkflowList: empty input → empty list", () => {
  eq(parseWorkflowList(""), []);
  eq(parseWorkflowList("\n\n\n"), []);
});

Deno.test("parseWorkflowList: preserves names with spaces", () => {
  eq(
    parseWorkflowList("Deno Tests\nDeno Fmt + Lint + Type-check"),
    ["Deno Tests", "Deno Fmt + Lint + Type-check"],
  );
});

Deno.test("safeName: strips backticks", () => {
  eq(safeName("CI`evil`"), "CIevil");
  eq(safeName("CI"), "CI");
});

Deno.test("dispatchWorkflows: dispatches each name with --ref", async () => {
  const calls: (readonly string[])[] = [];
  const gh: GhRunner = (args) => {
    calls.push(args);
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  const res = await dispatchWorkflows({
    workflows: "CI\nLint",
    ref: "release/v1.2.3",
    ghRunner: gh,
  });
  eq(res.dispatched.map((d) => d.name), ["CI", "Lint"]);
  eq(res.failed, []);
  eq(calls.length, 2);
  eq(calls[0], ["workflow", "run", "CI", "--ref", "release/v1.2.3"]);
  eq(calls[1], ["workflow", "run", "Lint", "--ref", "release/v1.2.3"]);
});

Deno.test("dispatchWorkflows: failures move to failed[], do not abort", async () => {
  const gh: GhRunner = (args) => {
    const name = args[2];
    if (name === "Missing") {
      return Promise.resolve({
        ok: false,
        stdout: "",
        stderr: "workflow not found",
      });
    }
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  const res = await dispatchWorkflows({
    workflows: "CI\nMissing\nLint",
    ref: "release/v1.0.0",
    ghRunner: gh,
  });
  eq(res.dispatched.map((d) => d.name), ["CI", "Lint"]);
  eq(res.failed.map((f) => f.name), ["Missing"]);
  eq(res.failed[0].error, "workflow not found");
});

Deno.test("dispatchWorkflows: empty list → no gh calls", async () => {
  let n = 0;
  const gh: GhRunner = () => {
    n += 1;
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  const res = await dispatchWorkflows({
    workflows: "\n\n  # only comments\n",
    ref: "x",
    ghRunner: gh,
  });
  eq(res.dispatched, []);
  eq(res.failed, []);
  eq(n, 0);
});
