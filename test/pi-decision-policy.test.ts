import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  ACTION_POLICY_MODULE_ENV,
  decisionPolicy,
  resolveActionPolicyModuleHref,
} from "../integrations/pi/decision-policy.js";

type ToolCallHandler = (
  event: { toolName: string; input: Record<string, unknown> },
  ctx: {
    hasUI: boolean;
    ui: {
      notify(message: string, level?: "info" | "warning" | "error"): void;
      confirm(title: string, message: string): Promise<boolean>;
    };
  },
) => Promise<unknown>;

function captureToolCallHandler(register: (pi: ExtensionAPI) => void): ToolCallHandler {
  let toolCallHandler: ToolCallHandler | undefined;
  const pi = {
    on(event: string, handler: ToolCallHandler) {
      if (event === "tool_call") toolCallHandler = handler;
      return () => undefined;
    },
  };
  register(pi as ExtensionAPI);
  assert.equal(typeof toolCallHandler, "function");
  return toolCallHandler!;
}

const testDir = dirname(fileURLToPath(import.meta.url));

const repoExtensionUrl = pathToFileURL(
  resolve(testDir, "../integrations/pi/decision-policy.ts"),
).href;

const builtPolicyPath = resolve(testDir, "../dist/action-policy.js");
const fixturePolicyPath = resolve(testDir, "fixtures/action-policy-stub.js");

void test("repo extension path resolves to the built action-policy module", () => {
  const href = resolveActionPolicyModuleHref({
    env: {},
    extensionModuleUrl: repoExtensionUrl,
  });

  assert.equal(href, pathToFileURL(builtPolicyPath).href);
});

void test("copied extension without override points outside the repository build", () => {
  const copiedExtensionUrl = pathToFileURL(resolve("/tmp/pi-extensions/decision-policy.ts")).href;

  const href = resolveActionPolicyModuleHref({
    env: {},
    extensionModuleUrl: copiedExtensionUrl,
  });

  assert.equal(
    href,
    pathToFileURL(resolve("/tmp/pi-extensions", "../../dist/action-policy.js")).href,
  );
  assert.notEqual(href, pathToFileURL(builtPolicyPath).href);
});

void test("DECISION_ACTION_POLICY_MODULE overrides resolution for copied installs", () => {
  const href = resolveActionPolicyModuleHref({
    env: {
      [ACTION_POLICY_MODULE_ENV]: builtPolicyPath,
    },
    extensionModuleUrl: pathToFileURL(resolve("/tmp/pi-extensions/decision-policy.ts")).href,
  });

  assert.equal(href, pathToFileURL(builtPolicyPath).href);
});

void test("Pi extension fails open when a copied install cannot resolve the policy module", async () => {
  const notifications: Array<{ message: string; level?: string }> = [];
  const toolCallHandler = captureToolCallHandler((pi) => {
    decisionPolicy(pi, {
      env: {},
      extensionModuleUrl: pathToFileURL(resolve("/tmp/pi-extensions/decision-policy.ts")).href,
    });
  });

  const result = await toolCallHandler(
    {
      toolName: "bash",
      input: { command: "rm -rf /tmp/demo" },
    },
    {
      hasUI: true,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
        confirm: async () => false,
      },
    },
  );

  assert.equal(result, undefined);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]?.message ?? "", /Decision policy unavailable/i);
  assert.equal(notifications[0]?.level, "warning");
});

void test("Pi extension fails open when the policy module cannot load", async () => {
  const notifications: Array<{ message: string; level?: string }> = [];
  const toolCallHandler = captureToolCallHandler((pi) => {
    decisionPolicy(pi, {
      loadPolicy: async () => {
        throw new Error("policy module missing");
      },
    });
  });

  const result = await toolCallHandler(
    {
      toolName: "bash",
      input: { command: "rm -rf /tmp/demo" },
    },
    {
      hasUI: true,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
        confirm: async () => false,
      },
    },
  );

  assert.equal(result, undefined);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]?.message ?? "", /policy module missing/i);
  assert.equal(notifications[0]?.level, "warning");
});

void test("Pi extension blocks when the policy returns block", async () => {
  const toolCallHandler = captureToolCallHandler((pi) => {
    decisionPolicy(pi, {
      loadPolicy: async () => ({
        isDecisionModelTool: () => false,
        evaluateActionPolicy: async () => ({
          action: "block" as const,
          reasons: ["destructive production change"],
          evaluated: true,
        }),
      }),
    });
  });

  const result = await toolCallHandler(
    {
      toolName: "bash",
      input: { command: "kubectl delete deployment payments -n production" },
    },
    {
      hasUI: true,
      ui: {
        notify() {},
        confirm: async () => true,
      },
    },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Decision model policy blocked this tool call: destructive production change",
  });
});

void test("Pi extension dynamically imports a policy module from DECISION_ACTION_POLICY_MODULE", async () => {
  const notifications: Array<{ message: string; level?: string }> = [];
  const toolCallHandler = captureToolCallHandler((pi) => {
    decisionPolicy(pi, {
      env: {
        [ACTION_POLICY_MODULE_ENV]: fixturePolicyPath,
      },
      // Simulate a copied extension path; the env override must win.
      extensionModuleUrl: pathToFileURL(resolve("/tmp/pi-extensions/decision-policy.ts")).href,
    });
  });

  const result = await toolCallHandler(
    {
      toolName: "bash",
      input: { command: "rm -rf /tmp/demo" },
    },
    {
      hasUI: true,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
        confirm: async () => true,
      },
    },
  );

  assert.deepEqual(result, {
    block: true,
    reason: "Decision model policy blocked this tool call: fixture blocked bash",
  });
  assert.equal(notifications.length, 0);
});
