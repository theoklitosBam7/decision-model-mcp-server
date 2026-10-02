# Project instructions

## Scope and workflow

- Keep changes within the requested scope. Preserve unrelated staged and unstaged work.
- Before editing, identify the requested outcome, affected files and public interfaces, and checks that will verify the change.
- For source, dependency, or tool-configuration changes, inspect `package.json` for scripts and runtime requirements. Use pnpm at the version declared there.
- When changing setup, MCP host configuration, or provider integration, read `README.md`. Verify its claims against the implementation before editing the documentation.

## Module boundaries

Before changing runtime behavior, read the relevant modules:

- `src/index.ts` defines MCP tools and formats tool results and errors.
- `src/schemas.ts` validates tool inputs. `src/types.ts` defines the shared decision and provider contracts.
- `src/decision.ts` coordinates decisions, concurrent batches, and local gate policies.
- `src/providers/index.ts` selects and registers providers. Provider implementations translate requests and normalize responses.
- `src/http.ts` handles JSON transport, timeouts, and provider errors.

Keep provider-specific endpoints, authentication, and payload translation in provider implementations. Register providers through the shared `DecisionProvider` contract and registry, not through provider-specific MCP tools.

## Compatibility and implementation

- Preserve tool names, input defaults, validation bounds, and response shapes unless the request explicitly changes them. Keep schemas and TypeScript contracts consistent.
- Preserve per-call provider and model overrides. Check fallback behavior when changing environment configuration.
- Preserve batch result order regardless of completion order, and honor the requested concurrency limit.
- Keep gate evaluation local. Preserve the priority of `block` over `review` over `allow`.
- Use `.js` extensions for relative imports in TypeScript, consistent with the NodeNext configuration.
- Validate external data before relying on its structure. Prefer existing Zod schemas and explicit narrowing over unchecked casts.
- Keep stdout reserved for MCP protocol traffic. Send diagnostics to stderr and redact credentials and sensitive payloads.
- Treat `dist/` as generated output. Make implementation changes in `src/` and run the build.

## Environment and dependency safety

The server reads `process.env` and does not load `.env` automatically. When diagnosing runtime configuration, inspect the actual launch command and process environment.

- Consult `.env.example` for supported environment variables. Keep real credentials in local configuration and redact them from output.
- To load a local environment file, supply an explicit Node.js `--env-file` argument or configure environment variables in the MCP host.
- Restart the MCP server connection after launch arguments or environment variables change. A successful build does not update an already running process.
- Distinguish provider availability from model availability. A reachable Ollama server does not prove that the selected model is installed.
- Use `pnpm install --frozen-lockfile` in CI and when verifying an existing lockfile. If a dependency change requires a lockfile update, run `pnpm install` and review the lockfile diff.
- Review dependency build-script approvals individually. Obtain approval before allowing a newly blocked script, and retain existing pnpm security settings.

## Test-driven development

For every coding task that adds or changes executable behavior, load and follow the `tdd` skill before implementation. Its instructions are in `.agents/skills/tdd/SKILL.md`, relative to the repository root. If the skill is unavailable or a meaningful executable test is blocked, stop and report the blocker before continuing.

Skip TDD for discovery, documentation, compatibility audits, and repository maintenance that do not change executable behavior. Run checks appropriate to that work.

## Verification and completion

For source, dependency, or tool-configuration changes, run all four checks:

```bash
pnpm run lint:check
pnpm run fmt:check
pnpm run typecheck
pnpm run build
```

- Run the check commands before applying automatic fixes. Limit formatting or automatic fixes to files within the requested scope, then rerun the checks.
- When a change affects routing, batch ordering, gate policy, or error handling, verify it with deterministic regression tests. Run live provider checks only when the required service and credentials are available; report them separately.
- When reporting a classification result, include a probability only if the provider returned it. Identify the provider and model, and report service failures as errors rather than results.
- Before completion, inspect the full diff, both staged and unstaged, for unintended or out-of-scope changes. Run `git diff --check`; if you staged your changes, also run `git diff --cached --check`.
- Report changed files and each relevant check result. Explain why any required check or regression test was not run or added.
