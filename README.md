# Decision models MCP server

A provider-neutral MCP server for classifier and decision models.

The server exposes the same MCP tools across providers. Set a default with `DECISION_PROVIDER`, or override the provider and model on each model-facing call.

## Built-in providers

- **Ollama** uses local decision models through `POST /v1/systemone`. Model examples include `nimble`, `tev1`, and `tev1:0.8b`.
- **Jev** uses the hosted TypeSafe Jev API through `POST /api/v1/decide`.

To add a provider, implement `DecisionProvider` in `src/providers/` and register it in `src/providers/index.ts`.

## MCP tools

- `decision_decide` evaluates named choice, `noul`, or score questions in one request.
- `decision_classify` selects one label.
- `decision_boolean` makes a yes/no judgement with a `noul` question.
- `decision_score` places state on an ordered rubric.
- `decision_batch` runs the same questions across several states.
- `decision_gate` applies a local `allow | review | block` policy to answers without another model call.
- `decision_providers` lists providers and checks basic availability.

Model-facing tools accept optional `provider` and `model` parameters.

## Requirements

- Node.js 20+
- pnpm 12.8.1, as declared in `package.json`
- For Ollama: Ollama 0.35+ and a decision model
- For Jev: a `JEV_API_KEY`

## Install

From the repository root, install dependencies and build the server:

```bash
pnpm install --frozen-lockfile
pnpm run build
```

The server reads environment variables from its process. It does not load `.env` itself. Set variables in your shell, MCP host, or process manager. In an MCP host config, you can also ask Node.js to load a local `.env` file with `--env-file` (Node.js 20.6.0+). See `.env.example` for the supported settings.

## Local Ollama setup

```bash
ollama pull nimble
# or
ollama pull tev1
# or the smaller model
ollama pull tev1:0.8b
```

Set:

```bash
export DECISION_PROVIDER=ollama
export OLLAMA_BASE_URL=http://127.0.0.1:11434
export OLLAMA_DECISION_MODEL=nimble
pnpm run dev
```

The provider availability check confirms that Ollama responds. It does not check whether the selected model is installed.

You can override the provider or model in each model-facing MCP call:

```json
{
  "provider": "ollama",
  "model": "tev1:0.8b",
  "state": "Fix the flaky unit test in auth.ts",
  "labels": {
    "simple": "Small local change",
    "coding": "Needs repository edits or tests",
    "research": "Needs external research"
  },
  "instructions": "Choose the best workflow."
}
```

## Hosted Jev setup

```bash
export DECISION_PROVIDER=jev
export JEV_API_KEY=jv_live_...
pnpm run dev
```

Or leave Ollama as the default and request Jev for one call with `"provider": "jev"`.

## Generic decision request

`decision_decide` uses the common System One-style shape:

```json
{
  "provider": "ollama",
  "model": "nimble",
  "state": {
    "ticket": "I was charged twice. Refund the extra payment."
  },
  "questions": {
    "team": {
      "type": "choice",
      "instructions": "Which team should handle this ticket?",
      "criteria": {
        "billing": "Payments and refunds",
        "technical": "Bugs and integrations",
        "other": "None of the above"
      }
    },
    "refund": {
      "type": "noul",
      "instructions": "Does the customer explicitly ask for a refund?"
    },
    "urgency": {
      "type": "score",
      "instructions": "How urgent is this ticket?",
      "criteria": ["Routine", "Soon", "Urgent"]
    }
  }
}
```

## MCP host configuration

After building, point your host at `dist/index.js` and provide environment variables.

Example shape:

```json
{
  "mcpServers": {
    "decision-models": {
      "command": "node",
      "args": ["/absolute/path/to/decision-mcp-server/dist/index.js"],
      "env": {
        "DECISION_PROVIDER": "ollama",
        "OLLAMA_BASE_URL": "http://127.0.0.1:11434",
        "OLLAMA_DECISION_MODEL": "nimble"
      }
    }
  }
}
```

To load a local `.env` file instead of listing settings under `env`, copy `.env.example` to `.env` and pass the file to Node.js before the script path:

```json
{
  "mcpServers": {
    "decision-models": {
      "command": "node",
      "args": [
        "--env-file=/absolute/path/to/decision-mcp-server/.env",
        "/absolute/path/to/decision-mcp-server/dist/index.js"
      ]
    }
  }
}
```

Node.js 20.6.0 and later supports `--env-file`. The project ignores `.env` in Git.

## Architecture

```text
Pi / Codex / Claude Code / other MCP host
                    |
                    v
         Decision Models MCP Server
                    |
            provider registry
             /            \
            v              v
         Ollama           Jev
      /v1/systemone    /api/v1/decide
            |              |
       nimble/tev1      hosted model
```

The provider registry selects the Ollama or Jev implementation. Each provider sends requests to its own API endpoint.

## Add another provider

Implement:

```ts
interface DecisionProvider {
  readonly id: string;
  readonly description: string;
  decide(request: DecisionRequest): Promise<DecisionResponse>;
  available(): Promise<{ ok: boolean; detail?: string }>;
}
```

Then register the provider in `src/providers/index.ts`.

Implement `decide()` to translate the common `state` and `questions` request into the provider API and normalize its response to `DecisionResponse`. Implement `available()` to report basic provider availability.

## Development

```bash
pnpm run lint:check
pnpm run fmt:check
pnpm run typecheck
pnpm run build
pnpm run inspect
```
