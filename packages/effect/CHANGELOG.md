# ff-effect

## 0.1.0

### Minor Changes

- 206737d: Upgrade to AI SDK v7 (`ai@^7`, `@ai-sdk/provider@^4`, `@ai-sdk/valibot@^3`).

  - `ff-effect`'s `for/ai` `generateText`/`streamText`/`tool` wrappers now thread `TOOLS`/`RUNTIME_CONTEXT`/`OUTPUT` generics (matching each function's own SDK defaults) to match the new `runtimeContext`/`toolsContext` support in `ai@7`; `Ai.ToolExecutionOptions` now requires an explicit context type argument.
  - `ff-effect`'s `for/ai` `generateText`/`streamText` now also effectify `ai@7`'s renamed callbacks — `onStepEnd`, `onEnd`, `onStart`, `onStepStart`, `onToolExecutionStart`, `onToolExecutionEnd`, `onLanguageModelCallStart`, `onLanguageModelCallEnd` (and their `experimental_`-prefixed aliases) — in addition to the deprecated names (`onStepFinish`, `onFinish`, `experimental_onStart`, `experimental_onStepStart`, `experimental_onToolCallStart`, `experimental_onToolCallFinish`), which are still supported.
  - `ff-ai`'s conversation `turn-handler` no longer slices `step.response.messages` against a running index — in `ai@7` each step's `response.messages` already contains only that step's new messages instead of the cumulative history.
  - `ff-ai`'s `getModelUsageCost` reads cached input tokens from `usage.inputTokenDetails.cacheReadTokens` instead of the removed `usage.cachedInputTokens`.

## 0.0.14

### Patch Changes

- 8498ce9: fix: preserve `OUTPUT` generic in `generateText` wrapper so `result.output` is properly typed instead of resolving to `any`

## 0.0.13

### Patch Changes

- 6661edf: Fix memory leak in Inngest handler: scope step FiberSets per invocation instead of leaking finalizers into the long-lived app scope
- 543492d: Add missing peer deps

## 0.0.12

### Patch Changes

- 1c615a1: Rename into `createDrizzle` for consistency
- c20b239: Allow requirement on step.run and use InngestFunction.Any

## 0.0.11

### Patch Changes

- 1228b3d: Add Inngest integration (`ff-effect/for/inngest`)
- bd63111: Add Effect wrappers for AI SDK (generateText, streamText, tool)

## 0.0.10

### Patch Changes

- b193333: Fix build issue and better context tag

## 0.0.9

### Patch Changes

- 081577d: Export `Drizzle` and `DrizzleTx` from `createDatabase`

## 0.0.8

### Patch Changes

- 611ace6: Add Drizzle ORM integration with `createDatabase` helper. Provides type-safe database operations with transaction support through `db`, `tx`, and `withTransaction`.

## 0.0.7

### Patch Changes

- ccb9584: Allow overriding error handler per-call

## 0.0.6

### Patch Changes

- b099de7: Fix type too-strict on arbitrary context

## 0.0.5

### Patch Changes

- d0f3a6f: Missing `FfOrpcCtx` export

## 0.0.4

### Patch Changes

- 6aa846e: Add `runEffect` support to orpc handler

## 0.0.3

### Patch Changes

- a8a7bd7: Added `wrapClient` helper

## 0.0.2

### Patch Changes

- e6aa98d: `createHandler` helper to build oRPC procedure which uses Effect-based handler
