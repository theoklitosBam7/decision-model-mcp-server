import { postJson } from "../http.js";
import type { DecisionProvider, DecisionRequest, DecisionResponse, JsonValue } from "../types.js";

const DEFAULT_BASE_URL = "https://jevtypesafe.org/api/v1";

function asObject(value: JsonValue): Record<string, JsonValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Jev returned an unexpected response shape.");
  }
  return value;
}

export class JevProvider implements DecisionProvider {
  readonly id = "jev";
  readonly description = "Hosted TypeSafe Jev decision API";

  async available() {
    return process.env.JEV_API_KEY
      ? { ok: true }
      : { ok: false, detail: "JEV_API_KEY is not configured." };
  }

  async decide(request: DecisionRequest): Promise<DecisionResponse> {
    const apiKey = process.env.JEV_API_KEY;
    if (!apiKey) throw new Error("JEV_API_KEY is not configured.");

    const baseUrl = (process.env.JEV_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const timeoutMs = Number(process.env.JEV_TIMEOUT_MS ?? "30000");

    const payload: Record<string, unknown> = {
      state: request.state,
      questions: request.questions,
    };
    if (request.model) payload.model = request.model;

    const raw = await postJson(this.id, `${baseUrl}/decide`, payload, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 30_000,
    });
    const object = asObject(raw);

    return {
      provider: this.id,
      model: typeof object.model === "string" ? object.model : request.model,
      answers: asObject(object.answers ?? {}),
      usage: object.usage,
      raw,
    };
  }
}
