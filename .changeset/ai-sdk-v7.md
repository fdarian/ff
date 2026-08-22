---
'ff-effect': minor
'ff-ai': minor
---

Upgrade to AI SDK v7 (`ai@^7`, `@ai-sdk/provider@^4`, `@ai-sdk/valibot@^3`).

- `ff-effect`'s `for/ai` `generateText`/`streamText`/`tool` wrappers now thread `TOOLS`/`RUNTIME_CONTEXT`/`OUTPUT` generics (matching each function's own SDK defaults) to match the new `runtimeContext`/`toolsContext` support in `ai@7`; `Ai.ToolExecutionOptions` now requires an explicit context type argument.
- `ff-effect`'s `for/ai` `generateText`/`streamText` now also effectify `ai@7`'s renamed callbacks — `onStepEnd`, `onEnd`, `onStart`, `onStepStart`, `onToolExecutionStart`, `onToolExecutionEnd`, `onLanguageModelCallStart`, `onLanguageModelCallEnd` (and their `experimental_`-prefixed aliases) — in addition to the deprecated names (`onStepFinish`, `onFinish`, `experimental_onStart`, `experimental_onStepStart`, `experimental_onToolCallStart`, `experimental_onToolCallFinish`), which are still supported.
- `ff-ai`'s conversation `turn-handler` no longer slices `step.response.messages` against a running index — in `ai@7` each step's `response.messages` already contains only that step's new messages instead of the cumulative history.
- `ff-ai`'s `getModelUsageCost` reads cached input tokens from `usage.inputTokenDetails.cacheReadTokens` instead of the removed `usage.cachedInputTokens`.
