import { JevProvider } from "./jev.js";
import { OllamaProvider } from "./ollama.js";
import type { DecisionProvider } from "../types.js";

const providers = new Map<string, DecisionProvider>([
  ["jev", new JevProvider()],
  ["ollama", new OllamaProvider()],
]);

function defaultProviderId() {
  return process.env.DECISION_PROVIDER ?? "ollama";
}

function allowedProviderIds(): Set<string> {
  const configured = process.env.DECISION_ALLOWED_PROVIDERS;
  if (!configured) return new Set([defaultProviderId()]);
  return new Set(
    configured
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function getProvider(id?: string): DecisionProvider {
  const selected = id ?? defaultProviderId();
  const provider = providers.get(selected);
  if (!provider) {
    throw new Error(
      `Unknown decision provider '${selected}'. Available providers: ${[...providers.keys()].join(", ")}.`,
    );
  }

  if (!allowedProviderIds().has(selected)) {
    throw new Error(
      `Decision provider '${selected}' is not allowed. Set DECISION_ALLOWED_PROVIDERS to permit it.`,
    );
  }

  return provider;
}

export function listProviders(): DecisionProvider[] {
  return [...providers.values()];
}
