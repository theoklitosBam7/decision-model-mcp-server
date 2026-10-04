import { postJson } from "../http.js";
import { validateDecisionResponse } from "../response.js";
import type { DecisionProvider, DecisionRequest, DecisionResponse } from "../types.js";

const DEFAULT_BASE_URL = "https://jevtypesafe.org/api/v1";

export function resolveJevBaseUrl(): string {
  const configured = process.env.JEV_API_BASE_URL ?? DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("JEV_API_BASE_URL must be a valid absolute URL.");
  }

  if (url.username || url.password) {
    throw new Error("JEV_API_BASE_URL must not contain embedded credentials.");
  }

  const allowInsecure = process.env.JEV_ALLOW_INSECURE_HTTP === "true";
  if (url.protocol !== "https:" && !(allowInsecure && url.protocol === "http:")) {
    throw new Error(
      "JEV_API_BASE_URL must use HTTPS. Set JEV_ALLOW_INSECURE_HTTP=true only for a trusted development endpoint.",
    );
  }

  return url.toString().replace(/\/$/, "");
}

export class JevProvider implements DecisionProvider {
  readonly id = "jev";
  readonly description = "Hosted TypeSafe Jev decision API";

  async available() {
    if (!process.env.JEV_API_KEY) {
      return { ok: false, detail: "JEV_API_KEY is not configured." };
    }

    try {
      resolveJevBaseUrl();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async decide(request: DecisionRequest): Promise<DecisionResponse> {
    const apiKey = process.env.JEV_API_KEY;
    if (!apiKey) throw new Error("JEV_API_KEY is not configured.");

    const baseUrl = resolveJevBaseUrl();
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

    return validateDecisionResponse(this.id, request, raw, request.model);
  }
}
