import { JevProvider } from "./jev.js";
import { OllamaProvider } from "./ollama.js";
import type { DecisionProvider } from "../types.js";

const providers = new Map<string, DecisionProvider>([
  ["jev", new JevProvider()],
  ["ollama", new OllamaProvider()],
]);

export function getProvider(id?: string): DecisionProvider {
  const selected = id ?? process.env.DECISION_PROVIDER ?? "ollama";
  const provider = providers.get(selected);
  if (!provider) {
    throw new Error(
      `Unknown decision provider '${selected}'. Available providers: ${[...providers.keys()].join(", ")}.`,
    );
  }
  return provider;
}

export function listProviders(): DecisionProvider[] {
  return [...providers.values()];
}
