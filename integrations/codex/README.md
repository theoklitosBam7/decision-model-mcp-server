# Codex CLI integration

Compatibility target: Codex CLI 0.160.1, the latest stable release on October 5, 2026.

This integration uses the current Codex MCP and lifecycle-hook interfaces.

## 1. Build the server

```bash
pnpm install --frozen-lockfile
pnpm run build
```

## 2. Register the MCP server

Run from this repository, replacing the path with an absolute path if needed:

```bash
codex mcp add decision-models \
  --env DECISION_PROVIDER=ollama \
  --env OLLAMA_BASE_URL=http://127.0.0.1:11434 \
  --env OLLAMA_DECISION_MODEL=nimble \
  -- node "$PWD/dist/index.js"

codex mcp list
```

## 3. Install the PreToolUse hook

Merge `integrations/codex/hooks.json` into the hooks configuration you use for Codex, or reference the same hook through your Codex configuration.

The hook is an `mcp_tool` hook. It passes the current `tool_name` and typed `tool_input` to `decision_action_policy`.

The matcher covers Codex shell and file-edit paths (`Bash`, `apply_patch`, and the `Edit`/`Write` aliases). It does not match MCP tool calls, so the policy hook cannot recursively evaluate its own MCP invocation. Add separate explicit matcher groups for other tool families you want to gate.

### Result behavior

- `allow`: the hook returns no decision and Codex continues with its normal permission behavior.
- `review`: the hook adds model-visible context telling Codex that review is required. Current Codex does not support `permissionDecision: "ask"` for `PreToolUse`, so this result cannot force an approval dialog.
- `block`: the hook returns `permissionDecision: "deny"`, which prevents the supported tool call.

Codex hooks are a useful guardrail, not a complete authorization boundary. Keep native Codex permissions enabled for consequential actions.

## Optional workflow skill

The repository also includes `.agents/skills/engineering-decisions/SKILL.md`. Both Codex and Pi can use this portable Agent Skill to apply the decision tools during normal engineering work.
