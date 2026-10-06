import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";

type ActionPolicyResult = {
  action: "allow" | "review" | "block";
  reasons: string[];
  evaluated: boolean;
};

type ActionPolicyModule = {
  evaluateActionPolicy(request: {
    toolName: string;
    toolInput: unknown;
  }): Promise<ActionPolicyResult>;
  isDecisionModelTool(toolName: string): boolean;
};

export const ACTION_POLICY_MODULE_ENV = "DECISION_ACTION_POLICY_MODULE";

export type DecisionPolicyExtensionOptions = {
  loadPolicy?: () => Promise<ActionPolicyModule>;
  env?: NodeJS.ProcessEnv;
  extensionModuleUrl?: string | URL;
};

export function resolveActionPolicyModuleHref(
  options: Pick<DecisionPolicyExtensionOptions, "env" | "extensionModuleUrl"> = {},
): string {
  const env = options.env ?? process.env;
  const configured = env[ACTION_POLICY_MODULE_ENV]?.trim();
  if (configured) {
    const absolute = isAbsolute(configured) ? configured : resolve(configured);
    return pathToFileURL(absolute).href;
  }

  const extensionModuleUrl = options.extensionModuleUrl ?? import.meta.url;
  const extensionDir = dirname(fileURLToPath(extensionModuleUrl));
  return pathToFileURL(resolve(extensionDir, "../../dist/action-policy.js")).href;
}

async function importActionPolicyModule(
  options: Pick<DecisionPolicyExtensionOptions, "env" | "extensionModuleUrl"> = {},
): Promise<ActionPolicyModule> {
  const href = resolveActionPolicyModuleHref(options);
  return (await import(href)) as ActionPolicyModule;
}

export function decisionPolicy(pi: ExtensionAPI, options: DecisionPolicyExtensionOptions = {}) {
  const loadPolicy = options.loadPolicy ?? (() => importActionPolicyModule(options));

  pi.on("tool_call", async (event: ToolCallEvent, ctx: ExtensionContext) => {
    let result: ActionPolicyResult;
    try {
      const policy = await loadPolicy();
      if (policy.isDecisionModelTool(event.toolName)) return;

      result = await policy.evaluateActionPolicy({
        toolName: event.toolName,
        toolInput: event.input,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (ctx.hasUI) {
        ctx.ui.notify(
          `Decision policy unavailable; using Pi's normal permissions: ${message}`,
          "warning",
        );
      }
      return;
    }

    if (!result.evaluated || result.action === "allow") return;

    const reason = result.reasons.join("; ") || "Decision policy requires review.";
    if (result.action === "block") {
      return {
        block: true,
        reason: `Decision model policy blocked this tool call: ${reason}`,
      } satisfies ToolCallEventResult;
    }

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `Decision model policy requires review, but this Pi session has no approval UI: ${reason}`,
      } satisfies ToolCallEventResult;
    }

    const approved = await ctx.ui.confirm(
      "Decision model review",
      `${event.toolName}\n\n${reason}\n\nAllow this tool call?`,
    );

    if (!approved) {
      return {
        block: true,
        reason: `Tool call rejected after decision-model review: ${reason}`,
      } satisfies ToolCallEventResult;
    }
  });
}

export default function decisionPolicyExtension(pi: ExtensionAPI) {
  decisionPolicy(pi);
}
