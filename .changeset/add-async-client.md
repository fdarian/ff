---
"ff-effect": patch
---

Add `asyncClient` utility that converts an Effect-based client into a normal async/await client. This is the inverse of `wrapClient` (Promise→Effect): it takes an Effect client and layer, creates a ManagedRuntime, and wraps all methods to return Promises instead of Effects.
