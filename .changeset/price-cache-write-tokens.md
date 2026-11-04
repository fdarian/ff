---
"ff-ai": patch
---

Price cache-write tokens in `calcInputCost` / `getModelUsageCost` (previously billed at $0 because AI SDK v7 excludes them from `noCacheTokens`). Cache writes use the model's `cache_write` rate, falling back to the input rate.
