import type { JsonValue } from "./types.js";

export class DecisionProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "DecisionProviderError";
  }
}

export async function postJson(
  provider: string,
  url: string,
  payload: unknown,
  options: {
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {},
): Promise<JsonValue> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new DecisionProviderError(
        `${provider} request failed with HTTP ${response.status}.`,
        provider,
        response.status,
        raw.slice(0, 2_000),
      );
    }

    try {
      return JSON.parse(raw) as JsonValue;
    } catch {
      throw new DecisionProviderError(
        `${provider} returned a non-JSON response.`,
        provider,
        response.status,
        raw.slice(0, 2_000),
      );
    }
  } catch (error) {
    if (error instanceof DecisionProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new DecisionProviderError(
        `${provider} request timed out after ${timeoutMs} ms.`,
        provider,
      );
    }
    throw new DecisionProviderError(
      `${provider} request failed: ${error instanceof Error ? error.message : String(error)}`,
      provider,
    );
  } finally {
    clearTimeout(timer);
  }
}
