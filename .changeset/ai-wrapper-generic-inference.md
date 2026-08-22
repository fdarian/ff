---
'ff-effect': patch
---

Fix two type-level defects in `ff-effect`'s `for/ai` `generateText`/`streamText`/`tool` wrappers.

- `generateText`/`streamText`: `OUTPUT` (and `TOOLS`/`RUNTIME_CONTEXT`) failed to infer from the `output`/`tools`/`runtimeContext` params, silently falling back to `OUTPUT`'s default (`Ai.Output.Output<string, string>`) — so `result.output` typed as `string` even when passing `output: Output.object({ schema: ... })`. Root cause: `Parameters<typeof Ai.generateText<TOOLS, RUNTIME_CONTEXT, OUTPUT>>[0]` is a conditional type that stays deferred while the wrapper's own generics are unsolved, blocking TS from walking into `output?: OUTPUT` — the one bare (non-`NoInfer`) inference site `ai` exposes. This predates the v7 bump (present in 0.0.14 via `510d430`); the v7 bump only added `RUNTIME_CONTEXT` and first gave `streamText` these generics.
- `tool`: reorder type params back to `<INPUT, OUTPUT, R = never, CONTEXT = Record<string, unknown>>`. 0.1.0 (`4cbffb8`) had inserted `CONTEXT` before `R` (`<INPUT, OUTPUT, CONTEXT, R>`), so an existing 3-arg caller `tool<In, Out, MyEffectR>(...)` silently bound its Effect requirements type to `CONTEXT` instead of `R` and failed with a cryptic "does not satisfy the constraint 'Record<string, unknown>'" rather than an arity error. This restores the 0.0.14 call shape rather than breaking it. `tool`'s `contextSchema` now infers `CONTEXT` for the same deferred-`Parameters` reason as above.
