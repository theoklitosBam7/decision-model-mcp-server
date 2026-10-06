import assert from "node:assert/strict";
import test from "node:test";

import {
  codexPreToolUseOutput,
  evaluateActionPolicy,
  shouldEvaluateAction,
} from "../src/action-policy.js";
import type { DecisionRequest, DecisionResponse } from "../src/types.js";

void test("consequential scope skips routine shell reads", () => {
  assert.equal(shouldEvaluateAction("Bash", { command: "git status" }), false);
});

void test("consequential scope evaluates destructive shell commands", () => {
  assert.equal(shouldEvaluateAction("Bash", { command: "git reset --hard HEAD~1" }), true);
});

void test("consequential scope evaluates curl requests that imply POST via data flags", () => {
  assert.equal(
    shouldEvaluateAction("Bash", {
      command: `curl https://api.example.com/users -d '{"admin":true}'`,
    }),
    true,
  );
  assert.equal(
    shouldEvaluateAction("Bash", {
      command: "curl https://api.example.com/upload -F file=@data.txt",
    }),
    true,
  );
  assert.equal(
    shouldEvaluateAction("Bash", {
      command: "curl https://api.example.com/upload --upload-file data.bin",
    }),
    true,
  );
  assert.equal(
    shouldEvaluateAction("Bash", {
      command: `curl https://api.example.com/users --json '{"admin":true}'`,
    }),
    true,
  );
});

void test("consequential scope skips plain curl reads without mutating options", () => {
  assert.equal(
    shouldEvaluateAction("Bash", { command: "curl https://api.example.com/users" }),
    false,
  );
  assert.equal(
    shouldEvaluateAction("Bash", { command: "curl -X GET https://api.example.com/users" }),
    false,
  );
});

void test("consequential scope evaluates a mutating curl after a safe curl in one shell command", () => {
  assert.equal(
    shouldEvaluateAction("Bash", {
      command:
        `curl -X GET https://example.com/status; ` +
        `curl https://api.example.com/users -d '{"admin":true}'`,
    }),
    true,
  );
  assert.equal(
    shouldEvaluateAction("Bash", {
      command:
        "curl -X GET https://example.com/status && curl https://api.example.com/upload -F file=@data.txt",
    }),
    true,
  );
  assert.equal(
    shouldEvaluateAction("Bash", {
      command: "curl -X GET https://example.com/a; curl -X GET https://example.com/b",
    }),
    false,
  );
});

void test("consequential scope evaluates sensitive edits", () => {
  assert.equal(
    shouldEvaluateAction("apply_patch", {
      command: "*** Update File: src/auth/permissions.ts\n@@\n-old\n+new",
    }),
    true,
  );
});

void test("action policy turns a model block classification into block", async () => {
  let captured: DecisionRequest | undefined;
  const fakeDecide = async (request: DecisionRequest): Promise<DecisionResponse> => {
    captured = request;
    return {
      provider: "test",
      model: "fixture",
      answers: {
        risk: { choice: "block", confidence: 0.98 },
        destructive: { noul: 0.99 },
        production: { noul: 0.95 },
        irreversible: { noul: 0.9 },
        sensitive: { noul: 0.1 },
      },
    };
  };

  const result = await evaluateActionPolicy(
    {
      toolName: "Bash",
      toolInput: { command: "kubectl delete deployment payments -n production" },
    },
    fakeDecide,
  );

  assert.equal(typeof captured?.state, "object");
  assert.equal(result.action, "block");
  assert.equal(result.evaluated, true);
  assert.equal(result.provider, "test");
});

void test("action policy returns review when a risk probability crosses a review threshold", async () => {
  const fakeDecide = async (): Promise<DecisionResponse> => ({
    provider: "test",
    answers: {
      risk: { choice: "routine", confidence: 0.9 },
      destructive: { noul: 0.7 },
      production: { noul: 0.1 },
      irreversible: { noul: 0.1 },
      sensitive: { noul: 0.1 },
    },
  });

  const result = await evaluateActionPolicy(
    {
      toolName: "Bash",
      toolInput: { command: "rm -rf ./generated-cache" },
    },
    fakeDecide,
  );

  assert.equal(result.action, "review");
  assert.match(result.reasons.join("\n"), /destructive/i);
});

void test("Codex adapter denies blocked PreToolUse actions", () => {
  assert.deepEqual(
    codexPreToolUseOutput({
      action: "block",
      reasons: ["risk: choice 'block' is blocked"],
      evaluated: true,
    }),
    {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "Decision model policy blocked this action: risk: choice 'block' is blocked",
      },
    },
  );
});

void test("Codex adapter keeps review advisory instead of using unsupported ask", () => {
  const output = codexPreToolUseOutput({
    action: "review",
    reasons: ["destructive: noul 0.7 >= review threshold 0.65"],
    evaluated: true,
  });

  const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
  assert.equal(hookOutput.hookEventName, "PreToolUse");
  assert.equal(Object.hasOwn(hookOutput, "permissionDecision"), false);
});
