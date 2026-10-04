import assert from "node:assert/strict";
import test from "node:test";

import { gate } from "../src/decision.js";
import { postJson } from "../src/http.js";
import { getProvider } from "../src/providers/index.js";
import { resolveJevBaseUrl } from "../src/providers/jev.js";
import { validateDecisionResponse } from "../src/response.js";
import type { DecisionRequest } from "../src/types.js";

function withEnv(
  changes: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
): Promise<void> | void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(changes)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const restore = () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  try {
    const result = fn();
    if (result instanceof Promise) return result.finally(restore);
    restore();
  } catch (error) {
    restore();
    throw error;
  }
}

void test("gate does not allow when a policy references a missing answer", () => {
  assert.deepEqual(
    gate(
      {},
      {
        choice: {
          classification: { allow: ["safe"], block: ["blocked"] },
        },
      },
    ),
    {
      action: "review",
      reasons: ["classification: required choice answer is missing"],
    },
  );
});

void test("gate does not allow malformed answer fields", () => {
  assert.deepEqual(
    gate(
      { risk: { type: "noul", noul: "not-a-number" } },
      {
        noul: {
          risk: { block_above: 0.9, review_above: 0.5 },
        },
      },
    ),
    {
      action: "review",
      reasons: ["risk: required noul answer is missing or invalid"],
    },
  );
});

void test("provider override is denied unless it is explicitly allowed", () =>
  withEnv(
    {
      DECISION_PROVIDER: "ollama",
      DECISION_ALLOWED_PROVIDERS: undefined,
    },
    () => {
      assert.equal(getProvider("ollama").id, "ollama");
      assert.throws(() => getProvider("jev"), /not allowed/i);
    },
  ));

void test("provider override can be enabled with DECISION_ALLOWED_PROVIDERS", () =>
  withEnv(
    {
      DECISION_PROVIDER: "ollama",
      DECISION_ALLOWED_PROVIDERS: "ollama,jev",
    },
    () => {
      assert.equal(getProvider("jev").id, "jev");
    },
  ));

void test("Jev rejects insecure HTTP endpoints by default", () =>
  withEnv(
    {
      JEV_API_BASE_URL: "http://example.invalid/api/v1",
      JEV_ALLOW_INSECURE_HTTP: undefined,
    },
    () => {
      assert.throws(() => resolveJevBaseUrl(), /HTTPS/i);
    },
  ));

void test("Jev permits explicit insecure HTTP only when opted in", () =>
  withEnv(
    {
      JEV_API_BASE_URL: "http://127.0.0.1:9000/api/v1/",
      JEV_ALLOW_INSECURE_HTTP: "true",
    },
    () => {
      assert.equal(resolveJevBaseUrl(), "http://127.0.0.1:9000/api/v1");
    },
  ));

void test("provider response validation rejects missing and unexpected answers", () => {
  const request: DecisionRequest = {
    state: "ticket",
    questions: {
      route: {
        type: "choice",
        instructions: "Route it",
        criteria: { billing: null, technical: null },
      },
    },
  };

  assert.throws(
    () =>
      validateDecisionResponse(
        "jev",
        request,
        {
          model: "jev-latest",
          answers: {
            injected: {
              type: "choice",
              choice: "billing",
              probabilities: { billing: 1, technical: 0 },
              confidence: 1,
            },
          },
        },
        "jev-latest",
      ),
    /answer keys/i,
  );
});

void test("provider response validation rejects an out-of-policy choice", () => {
  const request: DecisionRequest = {
    state: "ticket",
    questions: {
      route: {
        type: "choice",
        instructions: "Route it",
        criteria: { billing: null, technical: null },
      },
    },
  };

  assert.throws(
    () =>
      validateDecisionResponse(
        "ollama",
        request,
        {
          answers: {
            route: {
              type: "choice",
              choice: "admin",
              probabilities: { billing: 0.4, technical: 0.6 },
              confidence: 0.2,
            },
          },
        },
        "nimble",
      ),
    /not one of the requested criteria/i,
  );
});

void test("postJson enforces a response byte limit", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("x".repeat(32), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    await assert.rejects(
      () =>
        postJson("test", "https://example.invalid", {}, {
          maxResponseBytes: 16,
        }),
      /response exceeded 16 bytes/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
