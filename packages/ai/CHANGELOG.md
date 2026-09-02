# ff-ai

## 0.4.0

### Minor Changes

- abfedb6: Upgrade to Effect v4 (`effect@4.0.0-rc.111`).

  This is a breaking peer-dependency change for consumers: `effect` peer ranges moved from `^3` to `^4.0.0-rc.111`, and `@effect/platform` / `@effect/cli` were dropped as dependencies because v4 merged them into core `effect`.

## 0.3.0

### Minor Changes

- 206737d: Upgrade to AI SDK v7 (`ai@^7`, `@ai-sdk/provider@^4`, `@ai-sdk/valibot@^3`).

  - `ff-effect`'s `for/ai` `generateText`/`streamText`/`tool` wrappers now thread `TOOLS`/`RUNTIME_CONTEXT`/`OUTPUT` generics (matching each function's own SDK defaults) to match the new `runtimeContext`/`toolsContext` support in `ai@7`; `Ai.ToolExecutionOptions` now requires an explicit context type argument.
  - `ff-effect`'s `for/ai` `generateText`/`streamText` now also effectify `ai@7`'s renamed callbacks — `onStepEnd`, `onEnd`, `onStart`, `onStepStart`, `onToolExecutionStart`, `onToolExecutionEnd`, `onLanguageModelCallStart`, `onLanguageModelCallEnd` (and their `experimental_`-prefixed aliases) — in addition to the deprecated names (`onStepFinish`, `onFinish`, `experimental_onStart`, `experimental_onStepStart`, `experimental_onToolCallStart`, `experimental_onToolCallFinish`), which are still supported.
  - `ff-ai`'s conversation `turn-handler` no longer slices `step.response.messages` against a running index — in `ai@7` each step's `response.messages` already contains only that step's new messages instead of the cumulative history.
  - `ff-ai`'s `getModelUsageCost` reads cached input tokens from `usage.inputTokenDetails.cacheReadTokens` instead of the removed `usage.cachedInputTokens`.

## 0.2.2

### Patch Changes

- 4b0d8ef: Fix models.dev price lookup for model IDs with `-reasoning` suffix by retrying without the suffix on 404

## 0.2.1

### Patch Changes

- 13bbf44: Fix leftover LanguageModelV2

## 0.2.0

### Minor Changes

- eda3107: AI SDK v6

## 0.1.1

### Patch Changes

- 70bf737: Normalize "google.generative-ai" to "google"

## 0.1.0

### Minor Changes

- c2f4891: Added `getModelUsageCost` for calculating cost in USD from LanguageModelUsage
