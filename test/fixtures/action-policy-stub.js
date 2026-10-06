export function isDecisionModelTool(toolName) {
  const normalized = String(toolName).toLowerCase();
  return normalized.includes("decision-models") || normalized.includes("decision_models");
}

export async function evaluateActionPolicy(request) {
  return {
    action: "block",
    reasons: [`fixture blocked ${request.toolName}`],
    evaluated: true,
  };
}
