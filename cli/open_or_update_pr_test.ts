import { deepStrictEqual as eq, rejects } from "node:assert/strict";
import {
  findOpenPrByHead,
  openOrUpdateReleasePr,
  renderBody,
} from "./open_or_update_pr.ts";
import type { GhRunner } from "./gh.ts";

Deno.test("renderBody: includes title, prev→next, merge sentence, changelog preview", () => {
  const out = renderBody({
    version: "1.7.0",
    prevVersion: "1.6.1",
    unreleased: "### Added\n\n- thing",
  });
  eq(out.includes("## Release v1.7.0"), true);
  eq(out.includes("Auto-bumped from `1.6.1`"), true);
  eq(out.includes("tag `v1.7.0`"), true);
  eq(out.includes("### Changelog preview"), true);
  eq(out.includes("### Added"), true);
});

Deno.test("renderBody: empty unreleased becomes placeholder", () => {
  const out = renderBody({
    version: "1.0.0",
    prevVersion: "0.9.9",
    unreleased: "",
  });
  eq(out.includes("_No entries in [Unreleased]._"), true);
});

Deno.test("renderBody: whitespace-only unreleased also becomes placeholder", () => {
  const out = renderBody({
    version: "1.0.0",
    prevVersion: "0.9.9",
    unreleased: "  \n  \n",
  });
  eq(out.includes("_No entries in [Unreleased]._"), true);
});

const noWrite = () => Promise.resolve();

Deno.test("findOpenPrByHead: returns first PR number", async () => {
  const gh: GhRunner = () =>
    Promise.resolve({
      ok: true,
      stdout: JSON.stringify([{ number: 42 }, { number: 99 }]),
      stderr: "",
    });
  eq(await findOpenPrByHead("release/v1", "main", gh), 42);
});

Deno.test("findOpenPrByHead: null when no PRs", async () => {
  const gh: GhRunner = () =>
    Promise.resolve({ ok: true, stdout: "[]", stderr: "" });
  eq(await findOpenPrByHead("release/v1", "main", gh), null);
});

Deno.test("findOpenPrByHead: throws on gh failure", async () => {
  const gh: GhRunner = () =>
    Promise.resolve({ ok: false, stdout: "", stderr: "rate limited" });
  await rejects(
    () => findOpenPrByHead("x", "main", gh),
    /gh pr list failed: rate limited/,
  );
});

Deno.test("openOrUpdateReleasePr: opens new PR when none exists", async () => {
  const calls: (readonly string[])[] = [];
  const gh: GhRunner = (args) => {
    calls.push(args);
    if (args[1] === "list") {
      return Promise.resolve({ ok: true, stdout: "[]", stderr: "" });
    }
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  const res = await openOrUpdateReleasePr({
    head: "release/v1.7.0",
    version: "1.7.0",
    prevVersion: "1.6.1",
    unreleased: "### Added\n\n- thing",
    ghRunner: gh,
    writer: noWrite,
  });
  eq(res.action, "opened");
  eq(res.number, null);
  const create = calls.find((c) => c[1] === "create");
  if (!create) throw new Error("expected gh pr create");
  eq(create.includes("--head"), true);
  eq(create.includes("release/v1.7.0"), true);
  eq(create.includes("--base"), true);
  eq(create.includes("main"), true);
});

Deno.test("openOrUpdateReleasePr: updates existing PR when one matches head", async () => {
  const calls: (readonly string[])[] = [];
  const gh: GhRunner = (args) => {
    calls.push(args);
    if (args[1] === "list") {
      return Promise.resolve({
        ok: true,
        stdout: JSON.stringify([{ number: 100 }]),
        stderr: "",
      });
    }
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  const res = await openOrUpdateReleasePr({
    head: "release/v1.7.0",
    version: "1.7.0",
    prevVersion: "1.6.1",
    unreleased: "### Added\n\n- thing",
    ghRunner: gh,
    writer: noWrite,
  });
  eq(res.action, "updated");
  eq(res.number, 100);
  const edit = calls.find((c) => c[1] === "edit");
  if (!edit) throw new Error("expected gh pr edit");
  eq(edit[2], "100");
  eq(edit.includes("--title"), true);
  eq(edit.includes("Release v1.7.0"), true);
});

Deno.test("openOrUpdateReleasePr: writes body to bodyFile before invoking gh", async () => {
  let written = { path: "", content: "" };
  const writer = (p: string, c: string) => {
    written = { path: p, content: c };
    return Promise.resolve();
  };
  const gh: GhRunner = (args) => {
    if (args[1] === "list") {
      return Promise.resolve({ ok: true, stdout: "[]", stderr: "" });
    }
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  await openOrUpdateReleasePr({
    head: "release/v1.0.0",
    version: "1.0.0",
    prevVersion: "0.9.9",
    unreleased: "body",
    bodyFile: "/tmp/release-body.md",
    ghRunner: gh,
    writer,
  });
  eq(written.path, "/tmp/release-body.md");
  eq(written.content.includes("## Release v1.0.0"), true);
  eq(written.content.includes("body"), true);
});

Deno.test("openOrUpdateReleasePr: respects custom base", async () => {
  const calls: (readonly string[])[] = [];
  const gh: GhRunner = (args) => {
    calls.push(args);
    if (args[1] === "list") {
      return Promise.resolve({ ok: true, stdout: "[]", stderr: "" });
    }
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  await openOrUpdateReleasePr({
    base: "trunk",
    head: "release/v1.0.0",
    version: "1.0.0",
    prevVersion: "0.9.9",
    unreleased: "x",
    ghRunner: gh,
    writer: noWrite,
  });
  const list = calls.find((c) => c[1] === "list");
  if (!list) throw new Error("expected gh pr list");
  const baseIdx = list.indexOf("--base");
  eq(list[baseIdx + 1], "trunk");
});

Deno.test("openOrUpdateReleasePr: throws on gh pr create failure", async () => {
  const gh: GhRunner = (args) => {
    if (args[1] === "list") {
      return Promise.resolve({ ok: true, stdout: "[]", stderr: "" });
    }
    return Promise.resolve({ ok: false, stdout: "", stderr: "auth" });
  };
  await rejects(
    () =>
      openOrUpdateReleasePr({
        head: "x",
        version: "1.0.0",
        prevVersion: "0.9.9",
        unreleased: "",
        ghRunner: gh,
        writer: noWrite,
      }),
    /gh pr create failed: auth/,
  );
});

Deno.test("openOrUpdateReleasePr: throws on gh pr edit failure", async () => {
  const gh: GhRunner = (args) => {
    if (args[1] === "list") {
      return Promise.resolve({
        ok: true,
        stdout: JSON.stringify([{ number: 7 }]),
        stderr: "",
      });
    }
    return Promise.resolve({ ok: false, stdout: "", stderr: "denied" });
  };
  await rejects(
    () =>
      openOrUpdateReleasePr({
        head: "x",
        version: "1.0.0",
        prevVersion: "0.9.9",
        unreleased: "",
        ghRunner: gh,
        writer: noWrite,
      }),
    /gh pr edit failed: denied/,
  );
});
