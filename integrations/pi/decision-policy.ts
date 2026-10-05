import type {
  ExtensionAPI,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";

const POLICY_TOOL = "mcp__decision_models__decision_action_policy";

function resultText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

export default function decisionPolicy(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx): Promise<ToolCallEventResult | void> => {
    if (event.toolName.startsWith("mcp__decision_models__")) return;

    let result: {
      action: "allow" | "review" | "block";
      reasons: string[];
      evaluated: boolean;
    };

    try {
      const outcome = await ctx.executeTool(
        POLICY_TOOL,
        {
          tool_name: event.toolName,
          tool_input: event.input,
          scope: "consequential",
          output: "result",
        },
        { signal: ctx.signal },
      );

      const text = resultText(outcome.result.content);
      if (outcome.isError) {
        throw new Error(text || "decision_action_policy returned an error");
      }

      result = JSON.parse(text) as typeof result;
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
