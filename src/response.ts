import type { DecisionQuestion, DecisionRequest, DecisionResponse, JsonValue } from "./types.js";

function asObject(value: JsonValue | undefined, message: string): Record<string, JsonValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value;
}

function assertProbability(value: JsonValue, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a number between 0 and 1.`);
  }
}

function validateAnswer(name: string, question: DecisionQuestion, value: JsonValue) {
  const answer = asObject(value, `Provider answer '${name}' must be an object.`);

  if (answer.confidence !== undefined) {
    assertProbability(answer.confidence, `${name}.confidence`);
  }

  if (answer.noul !== undefined) {
    assertProbability(answer.noul, `${name}.noul`);
  }

  if (answer.probabilities !== undefined) {
    const probabilities = asObject(
      answer.probabilities,
      `${name}.probabilities must be an object.`,
    );
    const allowed =
      question.type === "choice" ? new Set(Object.keys(question.criteria)) : undefined;
    for (const [key, probability] of Object.entries(probabilities)) {
      if (allowed && !allowed.has(key)) {
        throw new Error(`${name}.probabilities contains unexpected criterion '${key}'.`);
      }
      assertProbability(probability, `${name}.probabilities.${key}`);
    }
  }

  if (question.type === "choice" && answer.choice !== undefined) {
    if (typeof answer.choice !== "string") {
      throw new Error(`${name}.choice must be a string.`);
    }
    if (!Object.hasOwn(question.criteria, answer.choice)) {
      throw new Error(`${name}.choice '${answer.choice}' is not one of the requested criteria.`);
    }
  }

  return answer;
}

export function validateDecisionResponse(
  provider: string,
  request: DecisionRequest,
  raw: JsonValue,
  fallbackModel?: string,
): DecisionResponse {
  const object = asObject(raw, `${provider} returned an unexpected response shape.`);
  const answers = asObject(
    object.answers,
    `${provider} response is missing a valid answers object.`,
  );

  const expectedKeys = Object.keys(request.questions).sort();
  const actualKeys = Object.keys(answers).sort();
  if (
    expectedKeys.length !== actualKeys.length ||
    expectedKeys.some((key, index) => key !== actualKeys[index])
  ) {
    throw new Error(`${provider} response answer keys do not match the requested questions.`);
  }

  const validated: Record<string, JsonValue> = {};
  for (const [name, question] of Object.entries(request.questions)) {
    validated[name] = validateAnswer(name, question, answers[name]);
  }

  return {
    provider,
    model: typeof object.model === "string" ? object.model : fallbackModel,
    answers: validated,
    usage: object.usage,
  };
}
