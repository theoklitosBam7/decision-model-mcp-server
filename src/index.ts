import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { batchDecide, decide, gate } from "./decision.js";
import { DecisionProviderError } from "./http.js";
import { listProviders } from "./providers/index.js";
import type { JsonValue } from "./types.js";
import {
  batchInputSchema,
  booleanInputSchema,
  classifyInputSchema,
  decideInputSchema,
  gateInputSchema,
  scoreInputSchema,
} from "./schemas.js";

const ok = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const fail = (error: unknown) => {
  const message =
    error instanceof DecisionProviderError
      ? [error.message, error.body].filter(Boolean).join("\n")
      : error instanceof Error
        ? error.message
        : String(error);
  return { content: [{ type: "text" as const, text: message }], isError: true };
};

function createServer(): McpServer {
  const server = new McpServer({ name: "decision-models", version: "0.1.0" });

  server.registerTool(
    "decision_decide",
    {
      description:
        "Run one or more typed decisions using a selectable classifier/decision-model provider. Supports choice, noul, and score questions.",
      inputSchema: decideInputSchema,
    },
    async ({ state, questions, provider, model }) => {
      try {
        return ok(await decide({ state: state as JsonValue, questions, provider, model }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "decision_classify",
    {
      description:
        "Classify state into one label using the selected decision provider/model. Useful for routing, intent, workflow, and tool-family selection.",
      inputSchema: classifyInputSchema,
    },
    async ({ state, labels, instructions, provider, model }) => {
      try {
        return ok(
          await decide({
            state: state as JsonValue,
            provider,
            model,
            questions: { classification: { type: "choice", instructions, criteria: labels } },
          }),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "decision_boolean",
    {
      description:
        "Make a calibrated yes/no decision. Returns the probability that the judgement is true.",
      inputSchema: booleanInputSchema,
    },
    async ({ state, question, true_description, false_description, provider, model }) => {
      try {
        const criteria =
          true_description || false_description
            ? { true: true_description, false: false_description }
            : undefined;
        return ok(
          await decide({
            state: state as JsonValue,
            provider,
            model,
            questions: { judgement: { type: "noul", instructions: question, criteria } },
          }),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "decision_score",
    {
      description: "Place state on an ordered rubric using the selected decision provider/model.",
      inputSchema: scoreInputSchema,
    },
    async ({ state, instructions, criteria, provider, model }) => {
      try {
        return ok(
          await decide({
            state: state as JsonValue,
            provider,
            model,
            questions: { score: { type: "score", instructions, criteria } },
          }),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "decision_batch",
    {
      description:
        "Run the same typed questions over several states. Implemented client-side so it works across providers.",
      inputSchema: batchInputSchema,
    },
    async ({ states, questions, provider, model, concurrency }) => {
      try {
        return ok(
          await batchDecide(states as JsonValue[], { questions, provider, model }, concurrency),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "decision_gate",
    {
      description:
        "Apply local allow/review/block policy to decision answers. Provider-neutral and does not make another model call.",
      inputSchema: gateInputSchema,
    },
    async ({ answers, policy }) => {
      try {
        return ok(gate(answers as Record<string, JsonValue>, policy));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "decision_providers",
    {
      description:
        "List configured decision-model providers and check whether each is currently available.",
    },
    async () => {
      const entries = await Promise.all(
        listProviders().map(async (provider) => ({
          id: provider.id,
          description: provider.description,
          ...(await provider.available()),
        })),
      );
      return ok({ default: process.env.DECISION_PROVIDER ?? "ollama", providers: entries });
    },
  );

  return server;
}

void serveStdio(createServer);
console.error("Decision Models MCP server running on stdio");
