type ToolCallEvent = {
  toolName: string;
  input: unknown;
};

type ToolCallEventResult = {
  block?: boolean;
  reason?: string;
};

type ToolCallContext = {
  hasUI: boolean;
  ui: {
    notify(message: string, level: "warning"): void;
    confirm(title: string, message: string): Promise<boolean>;
  };
};

type PiExtensionApi = {
  on(
    event: "tool_call",
    handler: (
      event: ToolCallEvent,
      ctx: ToolCallContext,
    ) => Promise<ToolCallEventResult | void>,
  ): void;
};

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

const POLICY_MODULE = "../../dist/action-policy.js";

async function loadPolicy(): Promise<ActionPolicyModule> {
  return (await import(POLICY_MODULE)) as ActionPolicyModule;
}

export default function decisionPolicy(pi: PiExtensionApi) {
  pi.on("tool_call", async (event, ctx) => {
    const policy = await loadPolicy();
    if (policy.isDecisionModelTool(event.toolName)) return;

    let result: ActionPolicyResult;
    try {
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
      };
    }

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `Decision model policy requires review, but this Pi session has no approval UI: ${reason}`,
      };
    }

    const approved = await ctx.ui.confirm(
      "Decision model review",
      `${event.toolName}\n\n${reason}\n\nAllow this tool call?`,
    );

    if (!approved) {
      return {
        block: true,
        reason: `Tool call rejected after decision-model review: ${reason}`,
      };
    }
  });
}
