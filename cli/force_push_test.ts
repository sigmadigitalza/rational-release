import { deepStrictEqual as eq, rejects } from "node:assert/strict";
import { forcePush } from "./force_push.ts";
import type { GitRunner } from "./git.ts";

const noSleep = () => Promise.resolve();

Deno.test("forcePush: first-attempt success → no warnings", async () => {
  let captured: readonly string[] = [];
  const git: GitRunner = (args) => {
    captured = args;
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  const res = await forcePush({
    refspec: "HEAD:refs/heads/release/v1.7.0",
    gitRunner: git,
    sleep: noSleep,
  });
  eq(res.warnings, []);
  eq(captured, ["push", "--force", "origin", "HEAD:refs/heads/release/v1.7.0"]);
});

Deno.test("forcePush: custom remote", async () => {
  let captured: readonly string[] = [];
  const git: GitRunner = (args) => {
    captured = args;
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  await forcePush({
    remote: "mirror",
    refspec: "main",
    gitRunner: git,
    sleep: noSleep,
  });
  eq(captured[2], "mirror");
});

Deno.test("forcePush: retries transient failures then succeeds", async () => {
  let n = 0;
  const git: GitRunner = () => {
    n += 1;
    if (n < 3) {
      return Promise.resolve({
        ok: false,
        stdout: "",
        stderr: "connection reset",
      });
    }
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  const res = await forcePush({
    refspec: "v1",
    gitRunner: git,
    sleep: noSleep,
    retries: 3,
  });
  eq(res.warnings.length, 2);
});

Deno.test("forcePush: throws after exhausting retries", async () => {
  const git: GitRunner = () =>
    Promise.resolve({ ok: false, stdout: "", stderr: "remote rejected" });
  await rejects(
    () =>
      forcePush({
        refspec: "v1",
        gitRunner: git,
        sleep: noSleep,
        retries: 3,
      }),
    /git push failed after 3 attempts/,
  );
});

Deno.test("forcePush: warning text includes attempt number + stderr", async () => {
  let n = 0;
  const git: GitRunner = () => {
    n += 1;
    if (n === 1) {
      return Promise.resolve({ ok: false, stdout: "", stderr: "boom" });
    }
    return Promise.resolve({ ok: true, stdout: "", stderr: "" });
  };
  const res = await forcePush({
    refspec: "x",
    gitRunner: git,
    sleep: noSleep,
  });
  eq(res.warnings.length, 1);
  eq(res.warnings[0].includes("attempt 1"), true);
  eq(res.warnings[0].includes("boom"), true);
});
