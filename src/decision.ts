import { getProvider } from "./providers/index.js";
import type { DecisionRequest, DecisionResponse, JsonValue } from "./types.js";

export async function decide(request: DecisionRequest): Promise<DecisionResponse> {
  return getProvider(request.provider).decide(request);
}

export async function batchDecide(
  states: JsonValue[],
  request: Omit<DecisionRequest, "state">,
  concurrency = 4,
): Promise<DecisionResponse[]> {
  const results: DecisionResponse[] = [];
  results.length = states.length;
  let next = 0;

  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= states.length) return;
      results[index] = await decide({ ...request, state: states[index] });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, states.length) }, () => worker()));
  return results;
}

type Answer = Record<string, JsonValue>;

type GatePolicy = {
  min_confidence?: number;
  noul?: Record<string, { block_above?: number; review_above?: number }>;
  choice?: Record<string, { allow?: string[]; review?: string[]; block?: string[] }>;
};

export function gate(answers: Answer, policy: GatePolicy = {}) {
  const reasons: string[] = [];
  let action: "allow" | "review" | "block" = "allow";

  const promote = (target: "review" | "block", reason: string) => {
    if (target === "block" || action === "allow") action = target;
    reasons.push(reason);
  };

  const policyNames = new Set([
    ...Object.keys(policy.noul ?? {}),
    ...Object.keys(policy.choice ?? {}),
  ]);

  for (const name of policyNames) {
    const value = answers[name];
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      if (policy.noul?.[name]) {
        promote("review", `${name}: required noul answer is missing or invalid`);
      } else {
        promote("review", `${name}: required choice answer is missing`);
      }
      continue;
    }

    const answer = value as Record<string, JsonValue>;
    if (policy.noul?.[name] && typeof answer.noul !== "number") {
      promote("review", `${name}: required noul answer is missing or invalid`);
    }
    if (policy.choice?.[name] && typeof answer.choice !== "string") {
      promote("review", `${name}: required choice answer is missing`);
    }
  }

  for (const [name, value] of Object.entries(answers)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      if (policy.min_confidence !== undefined) {
        promote("review", `${name}: confidence is missing or invalid`);
      }
      continue;
    }
    const answer = value as Record<string, JsonValue>;

    if (policy.min_confidence !== undefined) {
      if (typeof answer.confidence !== "number") {
        promote("review", `${name}: confidence is missing or invalid`);
      } else if (answer.confidence < policy.min_confidence) {
        promote(
          "review",
          `${name}: confidence ${answer.confidence} is below ${policy.min_confidence}`,
        );
      }
    }

    const noulPolicy = policy.noul?.[name];
    if (noulPolicy && typeof answer.noul === "number") {
      if (noulPolicy.block_above !== undefined && answer.noul >= noulPolicy.block_above) {
        promote(
          "block",
          `${name}: noul ${answer.noul} >= block threshold ${noulPolicy.block_above}`,
        );
      } else if (noulPolicy.review_above !== undefined && answer.noul >= noulPolicy.review_above) {
        promote(
          "review",
          `${name}: noul ${answer.noul} >= review threshold ${noulPolicy.review_above}`,
        );
      }
    }

    const choicePolicy = policy.choice?.[name];
    if (choicePolicy && typeof answer.choice === "string") {
      const choice = answer.choice;
      if (choicePolicy.block?.includes(choice))
        promote("block", `${name}: choice '${choice}' is blocked`);
      else if (choicePolicy.review?.includes(choice))
        promote("review", `${name}: choice '${choice}' requires review`);
      else if (choicePolicy.allow && !choicePolicy.allow.includes(choice))
        promote("review", `${name}: choice '${choice}' is not in allow list`);
    }
  }

  return { action, reasons };
}
