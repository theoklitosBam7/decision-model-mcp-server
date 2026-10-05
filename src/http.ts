import type { JsonValue } from "./types.js";

const DEFAULT_MAX_BODY_BYTES = 1_048_576;

export class DecisionProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "DecisionProviderError";
  }
}

async function readLimitedText(
  provider: string,
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new DecisionProviderError(
        `${provider} response exceeded ${maxBytes} bytes.`,
        provider,
        response.status,
      );
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

export async function postJson(
  provider: string,
  url: string,
  payload: unknown,
  options: {
    headers?: Record<string, string>;
    timeoutMs?: number;
    maxRequestBytes?: number;
    maxResponseBytes?: number;
  } = {},
): Promise<JsonValue> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxRequestBytes = options.maxRequestBytes ?? DEFAULT_MAX_BODY_BYTES;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_BODY_BYTES;
  const body = JSON.stringify(payload);
  if (body === undefined) {
    throw new DecisionProviderError(
      `${provider} request could not be serialized as JSON.`,
      provider,
    );
  }
  const bodyBytes = Buffer.byteLength(body);

  if (bodyBytes > maxRequestBytes) {
    throw new DecisionProviderError(
      `${provider} request exceeded ${maxRequestBytes} bytes.`,
      provider,
    );
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
      body,
      signal: controller.signal,
      redirect: "error",
    });

    const raw = await readLimitedText(provider, response, maxResponseBytes);
    if (!response.ok) {
      throw new DecisionProviderError(
        `${provider} request failed with HTTP ${response.status}.`,
        provider,
        response.status,
      );
    }

    try {
      return JSON.parse(raw) as JsonValue;
    } catch {
      throw new DecisionProviderError(
        `${provider} returned a non-JSON response.`,
        provider,
        response.status,
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
