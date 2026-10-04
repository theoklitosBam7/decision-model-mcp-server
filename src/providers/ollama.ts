import { postJson } from "../http.js";
import { validateDecisionResponse } from "../response.js";
import type { DecisionProvider, DecisionRequest, DecisionResponse } from "../types.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "nimble";

export class OllamaProvider implements DecisionProvider {
  readonly id = "ollama";
  readonly description = "Local Ollama /v1/systemone decision models";

  async available() {
    const baseUrl = (process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    try {
      const response = await fetch(`${baseUrl}/api/version`, {
        signal: AbortSignal.timeout(2_000),
        redirect: "error",
      });
      return response.ok
        ? { ok: true }
        : { ok: false, detail: `Ollama returned HTTP ${response.status}.` };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async decide(request: DecisionRequest): Promise<DecisionResponse> {
    const baseUrl = (process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const model = request.model ?? process.env.OLLAMA_DECISION_MODEL ?? DEFAULT_MODEL;
    const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? "120000");
    const keepAlive = process.env.OLLAMA_KEEP_ALIVE;

    const payload: Record<string, unknown> = {
      model,
      state: request.state,
      questions: request.questions,
    };
    if (keepAlive) payload.keep_alive = keepAlive;

    const raw = await postJson(this.id, `${baseUrl}/v1/systemone`, payload, {
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 120_000,
    });

    return validateDecisionResponse(this.id, request, raw, model);
  }
}
