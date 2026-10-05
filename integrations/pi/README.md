# Pi integration

This integration targets the current Pi extension and MCP APIs.

## Prerequisites

Build the decision server first:

```bash
pnpm install --frozen-lockfile
pnpm run build
```

Configure the provider in the environment where Pi starts, for example:

```bash
export DECISION_PROVIDER=ollama
export OLLAMA_BASE_URL=http://127.0.0.1:11434
export OLLAMA_DECISION_MODEL=nimble
```

## Add the MCP server

From this repository:

```bash
pi mcp add decision-models \
  --exposure codemode \
  --description "Structured engineering decisions and action policy" \
  -- node "$PWD/dist/index.js"

pi mcp list
```

Use `--local` if you want the entry in the current project's `.pi/mcp.json` instead of the user-level configuration.

## Load the policy extension

For one session:

```bash
pi --extension ./integrations/pi/decision-policy.ts
```

For regular use, copy or link `decision-policy.ts` into a trusted Pi extension directory.

The extension listens to Pi's `tool_call` event. It evaluates only consequential actions by default. A model result of `block` blocks the call. A result of `review` opens Pi's confirmation UI. In non-UI sessions, `review` blocks because no human confirmation is available.

Provider failures fail open to Pi's normal permission behavior so a local model outage does not make the coding agent unusable.

The extension imports the built `dist/action-policy.js`, so rerun `pnpm run build` after changing the policy implementation.
