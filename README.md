# Decision models MCP server

A provider-neutral MCP server for classifier and decision models.

The server exposes the same MCP tools across providers. Set a default with `DECISION_PROVIDER`. Per-call provider overrides are accepted only for providers listed in `DECISION_ALLOWED_PROVIDERS`; when that variable is omitted, only the default provider is allowed.

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
- `decision_gate` applies a local advisory `allow | review | block` policy to caller-supplied answers without another model call. Missing or malformed policy inputs return `review`. Because callers supply the answers, do not use this tool alone as an authorization boundary.
- `decision_action_policy` evaluates a proposed engineering tool call, skips routine actions in the default `consequential` scope, and combines model answers with a built-in advisory `allow | review | block` policy. It can emit Codex `PreToolUse` hook output directly.
- `decision_providers` lists providers and checks basic availability.

Model-facing tools accept optional `provider` and `model` parameters. Set `DECISION_ALLOWED_PROVIDERS` to a comma-separated allowlist when per-call provider switching is required.

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

You can override the model in each model-facing MCP call. To allow provider overrides, list each permitted provider first, for example `export DECISION_ALLOWED_PROVIDERS=ollama,jev`:

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

To leave Ollama as the default and request Jev for one call, set `DECISION_ALLOWED_PROVIDERS=ollama,jev` and then use `"provider": "jev"`. Jev endpoints must use HTTPS. Plain HTTP requires the explicit development-only setting `JEV_ALLOW_INSECURE_HTTP=true`.

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

Node.js 20.6.0 and later supports `--env-file`. The project ignores `.env` in Git. Model request and provider response bodies are limited to 1 MiB, and provider redirects are rejected.

## Coding-agent integrations

The repository includes integrations for current Codex CLI and Pi releases:

- `integrations/codex/hooks.json` uses a Codex `PreToolUse` `mcp_tool` hook to send supported tool calls to `decision_action_policy`. The hook excludes the decision server itself to prevent recursion.
- `integrations/pi/decision-policy.ts` uses Pi's `tool_call` extension event. It blocks model-classified `block` actions and asks for confirmation on `review` when UI is available.
- `.agents/skills/engineering-decisions/SKILL.md` is a portable Agent Skill discovered by current Pi and Codex project skill loading.

See `integrations/codex/README.md` and `integrations/pi/README.md` for setup.

The action policy is deliberately advisory. Keep the host's native permission and sandbox controls enabled.

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
