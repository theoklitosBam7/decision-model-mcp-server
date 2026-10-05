import type {
  ExtensionAPI,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";

import { evaluateActionPolicy, isDecisionModelTool } from "../../dist/action-policy.js";

export default function decisionPolicy(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx): Promise<ToolCallEventResult | void> => {
    if (isDecisionModelTool(event.toolName)) return;

    let result;
    try {
      result = await evaluateActionPolicy({
        toolName: event.toolName,
        toolInput: event.input,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (ctx.hasUI) {
        ctx.ui.notify(`Decision policy unavailable; using Pi's normal permissions: ${message}`, "warning");
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
