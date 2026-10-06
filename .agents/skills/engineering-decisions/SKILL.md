---
name: engineering-decisions
description: Use structured decision models to route non-trivial software engineering work, select verification depth, and assess consequential tool actions.
---

# Engineering decisions

Use the `decision-models` MCP server for small structured judgements that can change the engineering workflow.

## Route work

When the correct workflow is not obvious, call `decision_classify` with labels such as:

- `simple`: local or explanatory work with no repository change
- `coding`: implementation work with a known change
- `debug`: uncertain cause that needs evidence or reproduction
- `research`: external documentation or current information is needed
- `architecture`: a cross-component design decision is needed

Do not add a decision call when the workflow is already clear.

## Assess a non-trivial change

Prefer one `decision_decide` call with several independent questions over several separate model calls. Useful questions include:

- blast radius
- security sensitivity
- compatibility or migration risk
- minimum safe test depth

Use the answers to choose investigation and verification depth. Do not treat a model judgement as proof.

## Consequential actions

Use `decision_action_policy` for a proposed tool call when it can have meaningful side effects. The tool returns `allow`, `review`, or `block`.

- `allow`: continue through the host's normal permission system.
- `review`: get human review when the host integration supports it.
- `block`: do not execute the action as proposed.

The policy is advisory. The host remains the enforcement boundary.

## Verification

After implementation, use the changed surface and test results to decide whether focused, unit, integration, end-to-end, or full verification is appropriate. Always obey repository-specific required checks even when the decision model suggests a smaller test set.
