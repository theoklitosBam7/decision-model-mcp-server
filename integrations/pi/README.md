# Pi integration

Compatibility target: Pi v1.0.3, the latest stable release on October 5, 2026.

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

The extension listens to Pi's `tool_call` event and evaluates only consequential actions by default. Pi v1.0.3 gives lifecycle handlers an `ExtensionContext`; nested `ctx.executeTool()` is available only to tool execution contexts. To avoid an unsupported re-entrant MCP call from `tool_call`, the interceptor imports the same built `dist/action-policy.js` core that backs the MCP tool. A model result of `block` blocks the call. A result of `review` opens Pi's confirmation UI. In non-UI sessions, `review` blocks because no human confirmation is available.

Provider failures fail open to Pi's normal permission behavior so a local model outage does not make the coding agent unusable.

The MCP server remains available to Pi for agent-driven routing and decision calls. The interceptor skips the decision server's own tool names to avoid redundant evaluation. Rerun `pnpm run build` after changing the shared policy implementation.
